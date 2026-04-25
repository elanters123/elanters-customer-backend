// controllers/web/bookingController.js
const bookingService = require('../../services/bookingService');
const Booking = require('../../models/Booking');
const Coupon = require('../../models/Coupon');

const createBooking = async (req, res) => {
  try {
    const bookingData = { ...req.body, customer: { ...req.body.customer, id: req.customerId } };
    const booking = await bookingService.addBooking(bookingData);
    res.status(201).json({ success: true, booking });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { 'customer.id': req.customerId };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .sort({ 'history.createdAt': -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    const total = await Booking.countDocuments(query);
    res.json({ success: true, bookings, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      'customer.id': req.customerId,
    }).select('-__v');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const result = await bookingService.updateToCancelled(req.params.id, req.customerId, {
      reason: req.body.reason,
      canceledBy: 'customer',
    });
    if (!result.status) return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, booking: result.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { code, totalAmount } = req.body;
    if (!code || !totalAmount)
      return res.status(400).json({ success: false, message: 'code and totalAmount are required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    if (coupon.endDate && coupon.endDate < new Date())
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    if (totalAmount < coupon.minPurchaseAmount)
      return res.status(400).json({
        success: false,
        message: `Minimum order amount ₹${coupon.minPurchaseAmount} required`,
      });

    let discount = (totalAmount * coupon.discountPercent) / 100;
    if (coupon.maxDiscountAmount) discount = Math.min(discount, coupon.maxDiscountAmount);

    res.json({
      success: true,
      discount: Math.round(discount),
      discountPercent: coupon.discountPercent,
      couponCode: coupon.code,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const submitRating = async (req, res) => {
  try {
    const booking = await bookingService.addRating(req.params.id, req.body, req.customerId);
    res.json({ success: true, rating: booking.rating });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { createBooking, getMyBookings, getBookingById, cancelBooking, applyCoupon, submitRating };
