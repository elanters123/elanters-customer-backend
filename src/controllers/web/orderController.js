// controllers/web/orderController.js
// Plant orders on web — Razorpay first; Booking created only after payment verify.
const CustomerCart = require('../../models/CustomerCart');
const Booking = require('../../models/Booking');
const PendingRazorpayCheckout = require('../../models/PendingRazorpayCheckout');
const { buildMaterialsFromLineItems } = require('../../services/bookingService');
const { assertStandaloneEliteBody } = require('../../services/eliteService');
const { COD_MATERIALS_ONLINE_ONLY_MESSAGE } = require('../../constants/checkoutPayment');
require('../../models/Gardener');
const {
  createRazorpayInstance,
  assertRazorpayConfigured,
  formatRazorpayError,
  getRazorpayKeyId,
  getRazorpayKeySecret,
} = require('../../config/razorpay');
const { notifyBookingConfirmed } = require('../../services/pushNotificationService');
const crypto = require('crypto');

const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { 'customer.id': req.customerId, serviceType: 'gardening' };
    if (status) {
      query.status = status;
    } else {
      query.status = { $ne: 'pending' };
    }

    const bookings = await Booking.find(query)
      .populate('assignee.gardenerRef', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    const total = await Booking.countDocuments(query);
    const orders = bookings.map(bookingToOrder);
    res.json({ success: true, orders, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      'customer.id': req.customerId,
    })
      .populate('assignee.gardenerRef', 'name phone')
      .select('-__v');
    if (!booking) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order: bookingToOrder(booking) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Map a Booking document to the order shape the frontend uses. */
function bookingToOrder(b) {
  return {
    _id: b._id,
    customerId: b.customer?.id,
    items: (b.materials || []).map((m) => ({
      productId: m.id || m._id || null,
      name: m.name,
      price: m.price,
      quantity: m.quantity,
    })),
    deliveryAddress: {
      fullName: b.customer?.name || '',
      phone: b.customer?.phone || '',
      email: b.customer?.email || '',
      line1: b.location?.address || '',
      city: b.location?.city || '',
      state: b.location?.state || '',
      pincode: b.location?.postalCode || '',
    },
    subtotal: (b.payment?.totalAmount || 0) - 0,
    deliveryFee: 0,
    total: b.payment?.totalAmount || 0,
    couponCode: b.coupon?.code || null,
    walletCreditsUsed: 0,
    paymentMethod: b.payment?.method || 'cod',
    paymentStatus: b.payment?.status || 'pending',
    status: b.status,
    gardener: b.assignee?.gardenerRef
      ? {
          id: b.assignee.gardenerRef._id || null,
          name: b.assignee.gardenerRef.name || null,
          phone: b.assignee.gardenerRef.phone || null,
        }
      : null,
    eOrderId: b.eOrderId || null,
    description: b.description,
    scheduledDate: b.scheduledDateTime?.date,
    timeSlot: b.scheduledDateTime?.timeSlot,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** Razorpay session only — no Booking until confirm-payment. */
const createOrder = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);
    const { items, deliveryAddress, paymentMethod, couponCode, walletCreditsUsed = 0 } = req.body;
    if (!items?.length || !deliveryAddress || !paymentMethod)
      return res.status(400).json({ success: false, message: 'items, deliveryAddress and paymentMethod are required' });

    if (String(paymentMethod).toLowerCase() === 'cod') {
      return res.status(400).json({ success: false, message: COD_MATERIALS_ONLINE_ONLY_MESSAGE });
    }

    let enrichedItems;
    let subtotal;
    try {
      const built = await buildMaterialsFromLineItems(items);
      enrichedItems = built.materials;
      subtotal = built.subtotal;
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      return res.status(status).json({ success: false, message: e.message });
    }

    const deliveryFee = subtotal >= 500 ? 0 : 49;
    const total = Math.max(0, subtotal + deliveryFee - walletCreditsUsed);
    if (total < 1) {
      return res.status(400).json({ success: false, message: 'Order total must be at least ₹1 for online payment.' });
    }

    assertRazorpayConfigured();
    const razorpay = createRazorpayInstance();
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: `web_ord_${Date.now()}`,
      });
    } catch (rzpErr) {
      return res.status(503).json({ success: false, message: formatRazorpayError(rzpErr) });
    }

    await PendingRazorpayCheckout.create({
      kind: 'order',
      customerId: req.customerId,
      razorpayOrderId: razorpayOrder.id,
      amountPaise: razorpayOrder.amount,
      currency: 'INR',
      description: 'Elanters order',
      couponCode: couponCode || null,
      payload: {
        channel: 'web-booking',
        enrichedItems,
        deliveryAddress,
        paymentMethod,
        couponCode: couponCode || null,
        walletCreditsUsed,
        total,
      },
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });

    res.status(201).json({
      success: true,
      needsPayment: true,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: razorpayOrder.amount,
      currency: 'INR',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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

    if (pending?.payload?.channel === 'web-booking') {
      const p = pending.payload;
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 2);
      deliveryDate.setHours(0, 0, 0, 0);
      const chargedTotal = Math.round(pending.amountPaise) / 100;

      const booking = await Booking.create({
        serviceType: 'gardening',
        description: `Plant delivery — ${p.enrichedItems.length} item${p.enrichedItems.length > 1 ? 's' : ''}`,
        status: 'upcoming',
        eOrderId: razorpayOrderId,
        customer: {
          id: req.customerId,
          name: p.deliveryAddress.fullName || '',
          phone: p.deliveryAddress.phone || '',
          email: p.deliveryAddress.email || '',
        },
        scheduledDateTime: {
          date: deliveryDate,
          timeSlot: '9am-12pm',
        },
        location: {
          address: p.deliveryAddress.line1,
          city: p.deliveryAddress.city,
          state: p.deliveryAddress.state,
          postalCode: p.deliveryAddress.pincode,
          coordinates: { latitude: 0, longitude: 0 },
        },
        materials: p.enrichedItems,
        payment: {
          totalAmount: chargedTotal,
          status: 'paid',
          method: 'online',
          prePaidAmount: chargedTotal,
          transactionId: razorpayPaymentId,
          paymentDate: new Date(),
        },
        coupon: {
          code: p.couponCode || null,
          discountAmount: 0,
        },
        assignee: { type: 'admin', gardenerRef: null },
        history: {
          createdAt: new Date(),
          lastModifiedAt: new Date(),
        },
      });

      await PendingRazorpayCheckout.deleteOne({ _id: pending._id });
      await CustomerCart.findOneAndUpdate(
        { customerId: req.customerId },
        { $set: { items: [], couponCode: null } },
      );
      void notifyBookingConfirmed(req.customerId, booking);
      return res.json({ success: true, order: bookingToOrder(booking) });
    }

    // Legacy: booking was created before pay
    const booking = await Booking.findOneAndUpdate(
      { eOrderId: razorpayOrderId, 'customer.id': req.customerId },
      {
        $set: {
          'payment.transactionId': razorpayPaymentId,
          'payment.status': 'paid',
          status: 'upcoming',
          'history.lastModifiedAt': new Date(),
        },
      },
      { new: true },
    );

    if (!booking) return res.status(404).json({ success: false, message: 'Payment session not found' });

    await CustomerCart.findOneAndUpdate(
      { customerId: req.customerId },
      { $set: { items: [], couponCode: null } },
    );

    void notifyBookingConfirmed(req.customerId, booking);
    res.json({ success: true, order: bookingToOrder(booking) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, confirmPayment };
