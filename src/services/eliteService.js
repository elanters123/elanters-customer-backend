const crypto = require('crypto');
const Customer = require('../models/Customer');
const Coupon = require('../models/Coupon');
const CustomerCoupon = require('../models/CustomerCoupon');
const EliteMembershipOrder = require('../models/EliteMembershipOrder');
const { createRazorpayInstance, getRazorpayKeySecret } = require('../config/razorpay');

const ELITE_SALE_PRICE = 299;
const ELITE_DURATION_MONTHS = 6;
const ELITE_DISCOUNT_PERCENT = 15;

const ELITE_STANDALONE_MIX_MESSAGE =
  'Elite membership must be purchased separately and cannot be clubbed with plants, gardener visits, or other products.';

const ELITE_UPFRONT_PAYMENT_MESSAGE =
  'Elite membership requires upfront online payment.';

function randomSuffix(len = 8) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len).toUpperCase();
}

function generateEliteMemberId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `ELM-${y}${m}${day}-${randomSuffix()}`;
}

function generateEliteCouponCode() {
  return `ELITE15-${randomSuffix()}`;
}

function eliteExpiresAt(from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + ELITE_DURATION_MONTHS);
  return d;
}

function isEliteActive(customer, now = new Date()) {
  if (!customer?.eliteMemberSince || !customer?.eliteMemberExpiresAt) return false;
  return new Date(customer.eliteMemberExpiresAt) > now;
}

function assertStandaloneEliteBody(body = {}) {
  const hasEliteFlag = !!(
    body.eliteMembership ||
    body.purchaseElite ||
    body.elitePlan ||
    body.eliteOnly
  );
  const hasMerchandise = !!(
    (Array.isArray(body.items) && body.items.length > 0) ||
    (Array.isArray(body.catalogItems) && body.catalogItems.length > 0) ||
    body.gardener
  );
  if (hasEliteFlag && hasMerchandise) {
    const err = new Error(ELITE_STANDALONE_MIX_MESSAGE);
    err.status = 400;
    throw err;
  }
}

function assertEliteOnlinePayment(paymentMethod) {
  const method = String(paymentMethod || '').toLowerCase();
  if (method !== 'online') {
    const err = new Error(ELITE_UPFRONT_PAYMENT_MESSAGE);
    err.status = 400;
    throw err;
  }
}

async function issueEliteCoupon({ customerId, couponCode, expiresAt }) {
  const code = String(couponCode).trim().toUpperCase();
  let coupon = await Coupon.findOne({ code });
  if (!coupon) {
    coupon = await Coupon.create({
      name: 'Elite member discount',
      code,
      description: '15% off gardener services and gardening materials (not plants)',
      discountPercent: ELITE_DISCOUNT_PERCENT,
      minPurchaseAmount: 0,
      audience: 'customer_specific',
      endDate: expiresAt,
      isActive: true,
    });
  }

  const existing = await CustomerCoupon.findOne({ customerId, couponId: coupon._id });
  if (existing) {
    existing.status = 'active';
    existing.assignedAt = new Date();
    existing.usedAt = null;
    existing.expiresAt = expiresAt;
    await existing.save();
    return { coupon, assignment: existing };
  }

  const assignment = await CustomerCoupon.create({
    customerId,
    couponId: coupon._id,
    status: 'active',
    expiresAt,
  });
  return { coupon, assignment };
}

async function activateEliteMembership(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  const now = new Date();
  if (isEliteActive(customer, now)) {
    return {
      customer,
      memberId: customer.eliteMemberId,
      couponCode: customer.eliteCouponCode,
      expiresAt: customer.eliteMemberExpiresAt,
      alreadyActive: true,
    };
  }

  const memberId = generateEliteMemberId();
  const couponCode = generateEliteCouponCode();
  const expiresAt = eliteExpiresAt(now);

  await issueEliteCoupon({ customerId, couponCode, expiresAt });

  customer.eliteMemberId = memberId;
  customer.eliteMemberSince = now;
  customer.eliteMemberExpiresAt = expiresAt;
  customer.eliteCouponCode = couponCode;
  await customer.save();

  return {
    customer,
    memberId,
    couponCode,
    expiresAt,
    alreadyActive: false,
  };
}

async function createElitePurchaseIntent(customerId) {
  const customer = await Customer.findById(customerId).select('eliteMemberSince eliteMemberExpiresAt eliteMemberId eliteCouponCode');
  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }
  if (isEliteActive(customer)) {
    const err = new Error('Elite membership is already active on your account');
    err.status = 400;
    err.alreadyActive = true;
    throw err;
  }

  const razorpay = createRazorpayInstance();
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(ELITE_SALE_PRICE * 100),
    currency: 'INR',
    receipt: `elite_${Date.now()}`,
    notes: { purpose: 'elite_membership', customerId: String(customerId) },
  });

  const record = await EliteMembershipOrder.create({
    customerId,
    amount: ELITE_SALE_PRICE,
    paymentMethod: 'online',
    paymentStatus: 'pending',
    razorpayOrderId: razorpayOrder.id,
    status: 'pending',
  });

  return { razorpayOrder, record };
}

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const secret = getRazorpayKeySecret();
  if (!secret) {
    const err = new Error('Razorpay is not configured on the server');
    err.status = 500;
    throw err;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (expected !== razorpaySignature) {
    const err = new Error('Payment verification failed');
    err.status = 400;
    throw err;
  }
}

async function confirmElitePayment({
  customerId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

  const order = await EliteMembershipOrder.findOne({
    razorpayOrderId,
    customerId,
  });
  if (!order) {
    const err = new Error('Elite purchase order not found');
    err.status = 404;
    throw err;
  }

  if (order.status === 'activated') {
    const customer = await Customer.findById(customerId);
    return {
      order,
      memberId: order.eliteMemberId || customer?.eliteMemberId,
      couponCode: order.eliteCouponCode || customer?.eliteCouponCode,
      expiresAt: customer?.eliteMemberExpiresAt,
      alreadyActive: true,
    };
  }

  if (order.status !== 'pending') {
    const err = new Error('Elite purchase order is not payable');
    err.status = 400;
    throw err;
  }

  const activation = await activateEliteMembership(customerId);

  order.paymentStatus = 'paid';
  order.status = 'activated';
  order.razorpayPaymentId = razorpayPaymentId;
  order.razorpaySignature = razorpaySignature;
  order.eliteMemberId = activation.memberId;
  order.eliteCouponCode = activation.couponCode;
  await order.save();

  return {
    order,
    memberId: activation.memberId,
    couponCode: activation.couponCode,
    expiresAt: activation.expiresAt,
    alreadyActive: activation.alreadyActive,
  };
}

module.exports = {
  ELITE_SALE_PRICE,
  ELITE_STANDALONE_MIX_MESSAGE,
  ELITE_UPFRONT_PAYMENT_MESSAGE,
  assertStandaloneEliteBody,
  assertEliteOnlinePayment,
  isEliteActive,
  activateEliteMembership,
  createElitePurchaseIntent,
  confirmElitePayment,
};
