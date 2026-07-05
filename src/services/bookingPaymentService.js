const crypto = require('crypto');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const { createRazorpayInstance, getRazorpayKeySecret, getRazorpayKeyId } = require('../config/razorpay');
const { markCustomerCouponUsed } = require('./couponService');
const bookingService = require('./bookingService');

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const expected = crypto
    .createHmac('sha256', getRazorpayKeySecret())
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (expected !== razorpaySignature) {
    const err = new Error('Payment verification failed');
    err.status = 400;
    throw err;
  }
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

async function initBookingOnlinePayment(customerId, body) {
  const bookingData = normalizeCreateBookingBody(body, customerId);
  if (body.couponCode) bookingData.couponCode = body.couponCode;
  bookingData.status = 'pending';
  bookingData.payment = {
    ...bookingData.payment,
    method: 'online',
    prePaidAmount: 0,
  };

  const booking = await bookingService.addBooking(bookingData);

  const razorpay = createRazorpayInstance();
  const amountPaise = Math.round(Number(booking.payment.totalAmount) * 100);
  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `mob_booking_${String(booking._id).slice(-12)}`,
  });

  booking.eOrderId = razorpayOrder.id;
  await booking.save();

  const customer = await Customer.findById(customerId).select('name phoneNumber emailId');
  const phone = String(customer?.phoneNumber || booking.customer.phone || '').replace(/\D/g, '').slice(-10);

  return {
    booking,
    razorpayOrder,
    razorpayKeyId: getRazorpayKeyId(),
    prefill: {
      name: customer?.name || booking.customer.name,
      email: customer?.emailId || booking.customer.email || '',
      contact: phone ? `+91${phone}` : '',
    },
    couponCode: body.couponCode || body.coupon?.code || null,
  };
}

async function confirmBookingOnlinePayment(customerId, { razorpayOrderId, razorpayPaymentId, razorpaySignature, couponCode }) {
  verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

  const booking = await Booking.findOne({
    eOrderId: razorpayOrderId,
    'customer.id': customerId,
    status: 'pending',
  });

  if (!booking) {
    const err = new Error('Pending booking not found for this payment');
    err.status = 404;
    throw err;
  }

  booking.status = 'upcoming';
  booking.payment.status = 'paid';
  booking.payment.method = booking.payment.method || 'online';
  booking.payment.transactionId = razorpayPaymentId;
  booking.payment.paymentDate = new Date();
  await booking.save();

  const code = couponCode || booking.coupon?.code;
  if (code) {
    await markCustomerCouponUsed({ customerId, couponCode: code });
  }

  return booking;
}

module.exports = {
  initBookingOnlinePayment,
  confirmBookingOnlinePayment,
};
