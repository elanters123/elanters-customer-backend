// controllers/web/orderController.js
const CustomerCart = require('../../models/CustomerCart');
const Item = require('../../models/Item');
const Booking = require('../../models/Booking');
const { createRazorpayInstance } = require('../../config/razorpay');

const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { 'customer.id': req.customerId, serviceType: 'gardening' };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    const total = await Booking.countDocuments(query);

    // Map booking fields to the order shape the frontend expects
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
    }).select('-__v');
    if (!booking) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order: bookingToOrder(booking) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Map a Booking document to the CustomerOrder shape the frontend uses. */
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
    eOrderId: b.eOrderId || null,
    description: b.description,
    scheduledDate: b.scheduledDateTime?.date,
    timeSlot: b.scheduledDateTime?.timeSlot,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

const createOrder = async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, couponCode, walletCreditsUsed = 0 } = req.body;
    if (!items?.length || !deliveryAddress || !paymentMethod)
      return res.status(400).json({ success: false, message: 'items, deliveryAddress and paymentMethod are required' });

    let subtotal = 0;
    const enrichedItems = [];
    for (const item of items) {
      const product = await Item.findById(item.productId);
      if (!product) return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      const effectivePrice = product.offer > 0
        ? Math.round(product.price * (1 - product.offer / 100))
        : product.price;
      subtotal += effectivePrice * item.quantity;
      enrichedItems.push({
        name: product.name,
        price: effectivePrice,
        quantity: item.quantity,
      });
    }

    const deliveryFee = subtotal >= 500 ? 0 : 49;
    const total = subtotal + deliveryFee - walletCreditsUsed;

    // Online payments go through Razorpay; COD skips it
    let razorpayOrderId = null;
    let razorpayAmount = null;
    if (paymentMethod !== 'cod') {
      const razorpay = createRazorpayInstance();
      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: `order_${Date.now()}`,
      });
      razorpayOrderId = rzpOrder.id;
      razorpayAmount = rzpOrder.amount;
    }

    // Default delivery slot: 2 days from now
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 2);
    deliveryDate.setHours(0, 0, 0, 0);

    const booking = await Booking.create({
      serviceType: 'gardening',
      description: `Plant delivery — ${enrichedItems.length} item${enrichedItems.length > 1 ? 's' : ''}`,
      status: paymentMethod === 'cod' ? 'upcoming' : 'upcoming',
      customer: {
        id: req.customerId,
        name: deliveryAddress.fullName || '',
        phone: deliveryAddress.phone || '',
        email: deliveryAddress.email || '',
      },
      scheduledDateTime: {
        date: deliveryDate,
        timeSlot: '9am-12pm',
      },
      location: {
        address: deliveryAddress.line1,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        postalCode: deliveryAddress.pincode,
        coordinates: { latitude: 0, longitude: 0 },
      },
      materials: enrichedItems,
      payment: {
        totalAmount: total,
        status: 'pending',
        method: paymentMethod,
        prePaidAmount: 0,
      },
      coupon: {
        code: couponCode || null,
        discountAmount: 0,
      },
      assignee: { type: 'admin', gardenerRef: null },
      history: {
        createdAt: new Date(),
        lastModifiedAt: new Date(),
      },
      ...(razorpayOrderId ? { eOrderId: razorpayOrderId } : {}),
    });

    res.status(201).json({
      success: true,
      order: bookingToOrder(booking),
      ...(razorpayOrderId ? {
        razorpayOrderId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        amount: razorpayAmount,
      } : {}),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Called after successful Razorpay payment
const confirmPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature)
      return res.status(400).json({ success: false, message: 'Payment verification failed' });

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
      { new: true }
    );

    if (!booking) return res.status(404).json({ success: false, message: 'Order not found' });

    // Clear cart after successful payment
    await CustomerCart.findOneAndUpdate(
      { customerId: req.customerId },
      { $set: { items: [], couponCode: null } }
    );

    res.json({ success: true, order: bookingToOrder(booking) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, confirmPayment };
