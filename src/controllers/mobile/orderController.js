// controllers/mobile/orderController.js
// Mobile order controller — same logic, mobile-friendly response shape.
const CustomerOrder = require('../../models/CustomerOrder');
const CustomerCart = require('../../models/CustomerCart');
const Item = require('../../models/Item');
const { createRazorpayInstance } = require('../../config/razorpay');
const crypto = require('crypto');

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
    const { items, deliveryAddress, paymentMethod, couponCode, walletCreditsUsed = 0 } = req.body;
    if (!items?.length || !deliveryAddress || !paymentMethod)
      return res.status(400).json({ success: false, message: 'items, deliveryAddress and paymentMethod are required' });

    let subtotal = 0;
    for (const item of items) {
      const product = await Item.findById(item.productId);
      if (!product) return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      subtotal += product.price * item.quantity;
    }

    const deliveryFee = subtotal >= 500 ? 0 : 49;
    const total = subtotal + deliveryFee - walletCreditsUsed;

    const razorpay = createRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: 'INR',
      receipt: `mob_order_${Date.now()}`,
    });

    const order = await CustomerOrder.create({
      customerId: req.customerId,
      items,
      deliveryAddress,
      subtotal,
      deliveryFee,
      total,
      couponCode: couponCode || null,
      walletCreditsUsed,
      paymentMethod,
      razorpayOrderId: razorpayOrder.id,
    });

    res.status(201).json({
      success: true,
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZ_ID,
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

    const expected = crypto
      .createHmac('sha256', process.env.RAZ_SECRET)
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

    await CustomerCart.findOneAndUpdate({ customerId: req.customerId }, { $set: { items: [], couponCode: null } });

    res.json({ success: true, message: 'Payment confirmed', orderId: order._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOrders, getOrderById, createOrder, confirmPayment };
