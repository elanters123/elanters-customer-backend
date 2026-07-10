// controllers/mobile/bookingController.js
// Same business logic as web, response shaped for mobile consumption.
const bookingService = require('../../services/bookingService');
const Booking = require('../../models/Booking');
const {
  validateCouponForCheckout,
  markCustomerCouponUsed,
} = require('../../services/couponService');
const { assertStandaloneEliteBody } = require('../../services/eliteService');
const {
  initBookingOnlinePayment,
  confirmBookingOnlinePayment,
} = require('../../services/bookingPaymentService');
const { notifyBookingConfirmed } = require('../../services/pushNotificationService');

function isOnlinePaymentMethod(body) {
  const method = String(body.paymentMethod || body.payment?.method || '').toLowerCase();
  return method === 'online' || method === 'upi';
}

function normalizeCreateBookingBody(body, customerId) {
  const d = body.deliveryAddress;
  if (!d || body.location) {
    return { ...body, customer: { ...(body.customer || {}), id: customerId } };
  }
  const customer = {
    id: customerId,
    name: d.fullName || body.customer?.name || '',
    phone: d.phone || body.customer?.phone || '',
    email: d.email || body.customer?.email || '',
  };
  const location = {
    address: d.line1 || '',
    city: d.city || '',
    state: d.state || '',
    postalCode: d.pincode || '',
    coordinates: d.coordinates || { latitude: 0, longitude: 0 },
  };
  const payment = {
    ...(body.payment || {}),
    ...(body.paymentMethod && !(body.payment && body.payment.method)
      ? { method: body.paymentMethod }
      : {}),
  };
  const { deliveryAddress, paymentMethod, ...rest } = body;
  return { ...rest, customer, location, payment };
}

const createBooking = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);

    if (req.body.confirmOnlinePayment) {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature, couponCode } = req.body;
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
        });
      }
      const booking = await confirmBookingOnlinePayment(req.customerId, {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        couponCode,
      });
      void notifyBookingConfirmed(req.customerId, booking);
      return res.json({ success: true, booking });
    }

    if (isOnlinePaymentMethod(req.body)) {
      const { booking, razorpayOrder, razorpayKeyId, prefill, couponCode } =
        await initBookingOnlinePayment(req.customerId, req.body);
      return res.status(201).json({
        success: true,
        needsPayment: true,
        bookingId: booking._id,
        booking,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || 'INR',
        description: booking.description || 'Gardener booking',
        prefill,
        couponCode,
      });
    }

    const bookingData = normalizeCreateBookingBody(req.body, req.customerId);
    const booking = await bookingService.addBooking(bookingData);
    const couponCode = req.body.couponCode || req.body.coupon?.code;
    if (couponCode) {
      await markCustomerCouponUsed({
        customerId: req.customerId,
        couponCode,
      });
    }
    void notifyBookingConfirmed(req.customerId, booking);
    res.status(201).json({ success: true, booking });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { 'customer.id': req.customerId };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .sort({ 'history.createdAt': -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v -image');

    // Mobile gets a flat list — no pagination metadata needed by default
    res.json({ success: true, bookings, hasMore: bookings.length === Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      'customer.id': req.customerId,
    }).select('-__v -image');
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

const verifyServiceOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const result = await bookingService.verifyOTP(req.params.id, otp);
    if (result.status === 'error') return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, message: 'Service verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { code, totalAmount } = req.body;
    if (!code || totalAmount === undefined || totalAmount === null) {
      return res.status(400).json({ success: false, message: 'code and totalAmount are required' });
    }

    const result = await validateCouponForCheckout({
      customerId: req.customerId,
      code,
      totalAmount,
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      discount: result.discount,
      discountPercent: result.discountPercent,
      couponCode: result.couponCode,
      audience: result.audience,
      customerCouponId: result.customerCouponId,
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

/** POST body: { image: "data:image/...;base64,..." } — separate from create booking (heavy payload). */
const uploadBalconyPhoto = async (req, res) => {
  try {
    const result = await bookingService.setBookingBalconyPhoto(
      req.params.id,
      req.body.image,
      req.customerId,
    );
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getBalconyPhoto = async (req, res) => {
  try {
    const image = await bookingService.getBookingBalconyPhoto(req.params.id, req.customerId);
    if (!image) {
      return res.status(404).json({ success: false, message: 'No balcony photo for this booking' });
    }
    res.json({ success: true, image });
  } catch (error) {
    const status = /not found|not authorized/i.test(error.message) ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

const initPayment = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);
    const { booking, razorpayOrder, razorpayKeyId, prefill, couponCode } =
      await initBookingOnlinePayment(req.customerId, req.body);
    res.status(201).json({
      success: true,
      bookingId: booking._id,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || 'INR',
      description: booking.description || 'Gardener booking',
      prefill,
      couponCode,
    });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

const confirmPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, couponCode } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
      });
    }
    const booking = await confirmBookingOnlinePayment(req.customerId, {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      couponCode,
    });
    void notifyBookingConfirmed(req.customerId, booking);
    res.json({ success: true, booking });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  verifyServiceOTP,
  applyCoupon,
  submitRating,
  uploadBalconyPhoto,
  getBalconyPhoto,
  initPayment,
  confirmPayment,
};
