// controllers/mobile/orderController.js
// Mobile order controller — plant/product orders.
// UPI: Razorpay order first; CustomerOrder created only after payment verification.
const { COD_MATERIALS_ONLINE_ONLY_MESSAGE } = require('../../constants/checkoutPayment');
const CustomerOrder = require('../../models/CustomerOrder');
const CustomerCart = require('../../models/CustomerCart');
const PendingRazorpayCheckout = require('../../models/PendingRazorpayCheckout');
const {
  createRazorpayInstance,
  assertRazorpayConfigured,
  formatRazorpayError,
  getRazorpayKeyId,
  getRazorpayKeySecret,
} = require('../../config/razorpay');
const { markCustomerCouponUsed, validateCouponForCheckout } = require('../../services/couponService');
const { buildMaterialsFromLineItems } = require('../../services/bookingService');
const { assertStandaloneEliteBody } = require('../../services/eliteService');
const crypto = require('crypto');
const { notifyOrderConfirmed } = require('../../services/pushNotificationService');

const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { customerId: req.customerId };
    if (status) {
      query.status = status;
    } else {
      // Hide any legacy unpaid UPI drafts if they still exist.
      query.$nor = [{ status: 'pending', paymentStatus: 'pending' }];
    }

    const orders = await CustomerOrder.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    res.json({ success: true, orders, hasMore: orders.length === Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await CustomerOrder.findOne({
      _id: req.params.id,
      customerId: req.customerId,
    }).select('-__v');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

async function quotePlantOrder(reqBody, customerId) {
  const { items, deliveryAddress, paymentMethod, couponCode, walletCreditsUsed = 0 } = reqBody;
  if (!items?.length || !deliveryAddress || !paymentMethod) {
    const err = new Error('items, deliveryAddress and paymentMethod are required');
    err.status = 400;
    throw err;
  }

  const method = String(paymentMethod).toLowerCase();
  if (method === 'cod') {
    const err = new Error(COD_MATERIALS_ONLINE_ONLY_MESSAGE);
    err.status = 400;
    throw err;
  }

  let subtotal;
  let orderItems;
  try {
    const built = await buildMaterialsFromLineItems(items);
    subtotal = built.subtotal;
    orderItems = built.materials.map((m) => ({
      productId: m.id,
      name: m.name,
      image: '',
      quantity: m.quantity,
      price: m.price,
    }));
  } catch (e) {
    const err = new Error(e.message);
    err.status = /not found/i.test(e.message) ? 404 : 400;
    throw err;
  }

  const deliveryFee = subtotal >= 500 ? 0 : 49;
  let discount = 0;
  if (couponCode) {
    const coupon = await validateCouponForCheckout({
      customerId,
      code: couponCode,
      totalAmount: subtotal + deliveryFee,
    });
    if (!coupon.ok) {
      const err = new Error(coupon.message);
      err.status = coupon.status || 400;
      throw err;
    }
    discount = coupon.discount;
  }

  const total = Math.max(0, subtotal + deliveryFee - walletCreditsUsed - discount);
  if (total < 1) {
    const err = new Error('Order total must be at least ₹1 for online payment.');
    err.status = 400;
    throw err;
  }

  const normalizedPaymentMethod =
    method === 'online' || method === 'upi' ? 'upi' : paymentMethod;

  return {
    orderItems,
    deliveryAddress,
    subtotal,
    deliveryFee,
    discount,
    total,
    couponCode: couponCode || null,
    walletCreditsUsed,
    paymentMethod: normalizedPaymentMethod,
  };
}

/** Create Razorpay order only — no CustomerOrder until payment is verified. */
const createOrder = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);
    const quoted = await quotePlantOrder(req.body, req.customerId);

    assertRazorpayConfigured();
    const razorpay = createRazorpayInstance();
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(quoted.total * 100),
        currency: 'INR',
        receipt: `mob_ord_${Date.now()}`,
      });
    } catch (rzpErr) {
      const err = new Error(formatRazorpayError(rzpErr));
      err.status = 503;
      throw err;
    }

    await PendingRazorpayCheckout.create({
      kind: 'order',
      customerId: req.customerId,
      razorpayOrderId: razorpayOrder.id,
      amountPaise: razorpayOrder.amount,
      currency: 'INR',
      description: 'Elanters order',
      couponCode: quoted.couponCode,
      payload: quoted,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });

    res.status(201).json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: razorpayOrder.amount,
      currency: 'INR',
    });
  } catch (error) {
    const status = error.status && Number.isFinite(error.status) ? error.status : 500;
    const message = error.message || 'Failed to create order';
    res.status(status).json({ success: false, message });
  }
};

/** Cancel endpoint kept for legacy pending orders; no-op-friendly for new flow. */
const cancelOrder = async (req, res) => {
  try {
    const order = await CustomerOrder.findOne({
      _id: req.params.id,
      customerId: req.customerId,
    });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Paid orders cannot be cancelled here' });
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      return res.json({ success: true, order });
    }

    order.status = 'cancelled';
    order.paymentStatus = 'failed';
    await order.save();

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Verify Razorpay, then create the CustomerOrder as paid/confirmed. */
const confirmPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
      });
    }

    const expected = crypto
      .createHmac('sha256', getRazorpayKeySecret())
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    const pending = await PendingRazorpayCheckout.findOne({
      razorpayOrderId,
      customerId: req.customerId,
      kind: 'order',
    });

    if (pending) {
      const p = pending.payload;
      const order = await CustomerOrder.create({
        customerId: req.customerId,
        items: p.orderItems,
        deliveryAddress: p.deliveryAddress,
        subtotal: p.subtotal,
        deliveryFee: p.deliveryFee,
        discount: p.discount,
        total: p.total,
        couponCode: p.couponCode,
        walletCreditsUsed: p.walletCreditsUsed,
        paymentMethod: p.paymentMethod,
        paymentStatus: 'paid',
        status: 'confirmed',
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      await PendingRazorpayCheckout.deleteOne({ _id: pending._id });

      if (order.couponCode) {
        await markCustomerCouponUsed({
          customerId: req.customerId,
          couponCode: order.couponCode,
        });
      }

      await CustomerCart.findOneAndUpdate(
        { customerId: req.customerId },
        { $set: { items: [], couponCode: null } },
      );

      void notifyOrderConfirmed(req.customerId, order);
      return res.json({ success: true, message: 'Payment confirmed', orderId: order._id });
    }

    // Legacy: order was created before pay — mark paid if found.
    const order = await CustomerOrder.findOneAndUpdate(
      { razorpayOrderId, customerId: req.customerId },
      {
        $set: {
          razorpayPaymentId,
          razorpaySignature,
          paymentStatus: 'paid',
          status: 'confirmed',
        },
      },
      { new: true },
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Payment session not found' });
    }

    if (order.couponCode) {
      await markCustomerCouponUsed({
        customerId: req.customerId,
        couponCode: order.couponCode,
      });
    }

    await CustomerCart.findOneAndUpdate(
      { customerId: req.customerId },
      { $set: { items: [], couponCode: null } },
    );

    void notifyOrderConfirmed(req.customerId, order);
    res.json({ success: true, message: 'Payment confirmed', orderId: order._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, cancelOrder, confirmPayment };
