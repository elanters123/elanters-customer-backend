const crypto = require('crypto');
const Customer = require('../models/Customer');
const PendingRazorpayCheckout = require('../models/PendingRazorpayCheckout');
const {
  createRazorpayInstance,
  getRazorpayKeySecret,
  getRazorpayKeyId,
  assertRazorpayConfigured,
  formatRazorpayError,
} = require('../config/razorpay');
const { markCustomerCouponUsed } = require('./couponService');
const bookingService = require('./bookingService');

const PENDING_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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
    email:
      d.email ||
      body.customer?.email ||
      (d.phone || body.customer?.phone
        ? `customer+${String(d.phone || body.customer?.phone).replace(/\D/g, '').slice(-10)}@elanters.app`
        : ''),
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

/**
 * UPI/online init: create Razorpay order + store checkout payload only.
 * Does NOT create a Booking — that happens after payment verification.
 */
async function initBookingOnlinePayment(customerId, body) {
  const bookingData = normalizeCreateBookingBody(
    JSON.parse(JSON.stringify(body)),
    customerId,
  );
  if (body.couponCode) bookingData.couponCode = body.couponCode;

  // Quote server total without persisting a booking.
  const quoteClone = JSON.parse(JSON.stringify(bookingData));
  const pay = { ...(quoteClone.payment || {}) };
  delete pay.method;
  quoteClone.payment = { ...pay, status: 'pending', prePaidAmount: 0 };
  const { computedTotal, description } =
    await bookingService.resolveBookingLineItemsAndTotal(quoteClone);

  const amountPaise = Math.round(Number(computedTotal) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    const err = new Error('Booking total must be at least ₹1 for online payment.');
    err.status = 400;
    throw err;
  }

  assertRazorpayConfigured();
  const razorpay = createRazorpayInstance();
  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `mob_bk_${String(customerId).slice(-8)}_${Date.now().toString(36)}`.slice(0, 40),
    });
  } catch (rzpErr) {
    const err = new Error(formatRazorpayError(rzpErr));
    err.status = 503;
    throw err;
  }

  const couponCode = body.couponCode || body.coupon?.code || null;
  const payloadForConfirm = JSON.parse(JSON.stringify(body));
  // Persist charged total so confirm matches Razorpay amount.
  payloadForConfirm.payment = {
    ...(payloadForConfirm.payment || {}),
    totalAmount: computedTotal,
    prePaidAmount: 0,
  };
  if (couponCode) payloadForConfirm.couponCode = couponCode;

  await PendingRazorpayCheckout.create({
    kind: 'booking',
    customerId,
    razorpayOrderId: razorpayOrder.id,
    amountPaise,
    currency: 'INR',
    description: description || 'Gardener booking',
    couponCode,
    payload: payloadForConfirm,
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  });

  const customer = await Customer.findById(customerId).select('name phoneNumber emailId');
  const phone = String(customer?.phoneNumber || '').replace(/\D/g, '').slice(-10);

  return {
    razorpayOrder,
    razorpayKeyId: getRazorpayKeyId(),
    description: description || 'Gardener booking',
    prefill: {
      name: customer?.name || '',
      email: customer?.emailId || '',
      contact: phone ? `+91${phone}` : '',
    },
    couponCode,
  };
}

/**
 * After Razorpay success: verify signature, then create the Booking as paid/upcoming.
 */
async function confirmBookingOnlinePayment(
  customerId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature, couponCode },
) {
  verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

  const pending = await PendingRazorpayCheckout.findOne({
    razorpayOrderId,
    customerId,
    kind: 'booking',
  });
  if (!pending) {
    const err = new Error('Payment session not found or already completed');
    err.status = 404;
    throw err;
  }

  const chargedTotal = Math.round(pending.amountPaise) / 100;
  const bookingData = normalizeCreateBookingBody(
    JSON.parse(JSON.stringify(pending.payload)),
    customerId,
  );
  if (pending.couponCode || couponCode) {
    bookingData.couponCode = couponCode || pending.couponCode;
  }
  bookingData.status = 'upcoming';
  bookingData.eOrderId = razorpayOrderId;
  bookingData.payment = {
    ...(bookingData.payment || {}),
    totalAmount: chargedTotal,
    status: 'paid',
    method: 'online',
    prePaidAmount: chargedTotal,
    transactionId: razorpayPaymentId,
    paymentDate: new Date(),
  };

  const booking = await bookingService.addBooking(bookingData);

  await PendingRazorpayCheckout.deleteOne({ _id: pending._id });

  const code = couponCode || pending.couponCode || booking.coupon?.code;
  if (code) {
    await markCustomerCouponUsed({ customerId, couponCode: code });
  }

  return booking;
}

module.exports = {
  initBookingOnlinePayment,
  confirmBookingOnlinePayment,
};
