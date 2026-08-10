// controllers/mobile/orderController.js
// Mobile order controller — same logic, mobile-friendly response shape.
const { COD_MATERIALS_ONLINE_ONLY_MESSAGE } = require('../../constants/checkoutPayment');
const CustomerOrder = require('../../models/CustomerOrder');
const CustomerCart = require('../../models/CustomerCart');
const {
  createRazorpayInstance,
  assertRazorpayConfigured,
  formatRazorpayError,
  getRazorpayKeyId,
} = require('../../config/razorpay');
const { markCustomerCouponUsed, validateCouponForCheckout } = require('../../services/couponService');
const { buildMaterialsFromLineItems } = require('../../services/bookingService');
const { assertStandaloneEliteBody } = require('../../services/eliteService');
const crypto = require('crypto');
const { notifyOrderConfirmed } = require('../../services/pushNotificationService');

const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { customerId: req.customerId };
    if (status) query.status = status;

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

const createOrder = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);
    const { items, deliveryAddress, paymentMethod, couponCode, walletCreditsUsed = 0 } = req.body;
    if (!items?.length || !deliveryAddress || !paymentMethod)
      return res.status(400).json({ success: false, message: 'items, deliveryAddress and paymentMethod are required' });

    const method = String(paymentMethod).toLowerCase();
    if (method === 'cod') {
      return res.status(400).json({ success: false, message: COD_MATERIALS_ONLINE_ONLY_MESSAGE });
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
      const status = /not found/i.test(e.message) ? 404 : 400;
      return res.status(status).json({ success: false, message: e.message });
    }

    const deliveryFee = subtotal >= 500 ? 0 : 49;
    let discount = 0;
    if (couponCode) {
      const coupon = await validateCouponForCheckout({
        customerId: req.customerId,
        code: couponCode,
        totalAmount: subtotal + deliveryFee,
      });
      if (!coupon.ok) {
        return res.status(coupon.status || 400).json({ success: false, message: coupon.message });
      }
      discount = coupon.discount;
    }

    const total = Math.max(0, subtotal + deliveryFee - walletCreditsUsed - discount);
    if (total < 1) {
      return res.status(400).json({
        success: false,
        message: 'Order total must be at least ₹1 for online payment.',
      });
    }

    assertRazorpayConfigured();
    const razorpay = createRazorpayInstance();
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: `mob_order_${Date.now()}`,
      });
    } catch (rzpErr) {
      const err = new Error(formatRazorpayError(rzpErr));
      err.status = 503;
      throw err;
    }

    const normalizedPaymentMethod =
      method === 'online' || method === 'upi' ? 'upi' : paymentMethod;

    const order = await CustomerOrder.create({
      customerId: req.customerId,
      items: orderItems,
      deliveryAddress,
      subtotal,
      deliveryFee,
      discount,
      total,
      couponCode: couponCode || null,
      walletCreditsUsed,
      paymentMethod: normalizedPaymentMethod,
      razorpayOrderId: razorpayOrder.id,
    });

    if (couponCode && paymentMethod === 'cod') {
      await markCustomerCouponUsed({ customerId: req.customerId, couponCode });
    }

    res.status(201).json({
      success: true,
      orderId: order._id,
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

const confirmPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || process.env.RAZ_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature)
      return res.status(400).json({ success: false, message: 'Payment verification failed' });

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
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.couponCode) {
      await markCustomerCouponUsed({
        customerId: req.customerId,
        couponCode: order.couponCode,
      });
    }

    await CustomerCart.findOneAndUpdate({ customerId: req.customerId }, { $set: { items: [], couponCode: null } });

    void notifyOrderConfirmed(req.customerId, order);

    res.json({ success: true, message: 'Payment confirmed', orderId: order._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, confirmPayment };
