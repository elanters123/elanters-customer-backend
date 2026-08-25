const Coupon = require('../models/Coupon');
const CustomerCoupon = require('../models/CustomerCoupon');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function couponIsInDateWindow(coupon, now = new Date()) {
  if (coupon.startDate && coupon.startDate > now) {
    return { ok: false, message: 'Coupon is not active yet' };
  }
  if (coupon.endDate && coupon.endDate < now) {
    return { ok: false, message: 'Coupon has expired' };
  }
  return { ok: true };
}

function mappingIsActive(mapping, now = new Date()) {
  if (!mapping || mapping.status !== 'active') return false;
  if (mapping.expiresAt && mapping.expiresAt < now) return false;
  return true;
}

function serializeActiveCoupon(coupon, extra = {}) {
  return {
    couponId: String(coupon._id),
    code: coupon.code,
    name: coupon.name,
    description: coupon.description || '',
    discountPercent: coupon.discountPercent,
    minPurchaseAmount: coupon.minPurchaseAmount ?? 0,
    maxDiscountAmount: coupon.maxDiscountAmount ?? null,
    audience: coupon.audience || 'all_customers',
    startDate: coupon.startDate ?? null,
    endDate: coupon.endDate ?? null,
    ...extra,
  };
}

/**
 * Assign a customer-specific coupon to one customer.
 * Global (all_customers) coupons do not need assignment.
 */
async function assignCouponToCustomer({ customerId, couponCode }) {
  const code = normalizeCode(couponCode);
  if (!code) throw new Error('couponCode is required');

  const coupon = await Coupon.findOne({ code, isActive: true });
  if (!coupon) throw new Error('Coupon not found or inactive');

  const window = couponIsInDateWindow(coupon);
  if (!window.ok) throw new Error(window.message);

  if (coupon.audience !== 'customer_specific') {
    throw new Error('Only customer_specific coupons can be assigned to a customer');
  }

  const existing = await CustomerCoupon.findOne({ customerId, couponId: coupon._id });
  if (existing) {
    if (existing.status === 'active' && mappingIsActive(existing)) {
      return { assignment: existing, coupon, created: false };
    }
    existing.status = 'active';
    existing.assignedAt = new Date();
    existing.usedAt = null;
    existing.expiresAt = coupon.endDate || null;
    await existing.save();
    return { assignment: existing, coupon, created: false, reactivated: true };
  }

  const assignment = await CustomerCoupon.create({
    customerId,
    couponId: coupon._id,
    status: 'active',
    expiresAt: coupon.endDate || null,
  });

  return { assignment, coupon, created: true };
}

/** Active coupons for profile: global + assigned customer-specific. */
async function getActiveCouponsForCustomer(customerId) {
  const now = new Date();

  const globals = await Coupon.find({
    isActive: true,
    audience: 'all_customers',
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  }).lean();

  const assignments = await CustomerCoupon.find({
    customerId,
    status: 'active',
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  })
    .populate('couponId')
    .lean();

  const globalItems = globals.map((c) =>
    serializeActiveCoupon(c, { source: 'global' }),
  );

  const assignedItems = assignments
    .filter((a) => a.couponId && a.couponId.isActive)
    .filter((a) => couponIsInDateWindow(a.couponId, now).ok)
    .map((a) =>
      serializeActiveCoupon(a.couponId, {
        source: 'assigned',
        customerCouponId: String(a._id),
        assignedAt: a.assignedAt,
        expiresAt: a.expiresAt,
      }),
    );

  const byCode = new Map();
  for (const item of [...globalItems, ...assignedItems]) {
    byCode.set(item.code, item);
  }

  return [...byCode.values()];
}

async function validateCouponForCheckout({ customerId, code, totalAmount }) {
  const normalized = normalizeCode(code);
  const amount = Number(totalAmount);
  if (!normalized) return { ok: false, status: 400, message: 'code is required' };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, message: 'totalAmount must be a positive number' };
  }

  const coupon = await Coupon.findOne({ code: normalized, isActive: true });
  if (!coupon) return { ok: false, status: 404, message: 'Invalid or expired coupon' };

  const window = couponIsInDateWindow(coupon);
  if (!window.ok) return { ok: false, status: 400, message: window.message };

  if (amount < (coupon.minPurchaseAmount || 0)) {
    return {
      ok: false,
      status: 400,
      message: `Minimum order amount ₹${coupon.minPurchaseAmount} required`,
    };
  }

  let customerCouponId = null;

  if (coupon.audience === 'customer_specific') {
    const mapping = await CustomerCoupon.findOne({
      customerId,
      couponId: coupon._id,
      status: 'active',
    });
    if (!mappingIsActive(mapping)) {
      return {
        ok: false,
        status: 403,
        message: 'This coupon is not available for your account.',
      };
    }
    customerCouponId = String(mapping._id);
  }

  let discount = (amount * coupon.discountPercent) / 100;
  if (coupon.maxDiscountAmount) discount = Math.min(discount, coupon.maxDiscountAmount);

  return {
    ok: true,
    discount: Math.round(discount),
    discountPercent: coupon.discountPercent,
    couponCode: coupon.code,
    audience: coupon.audience || 'all_customers',
    customerCouponId,
  };
}

/** Mark assigned coupon as used after successful checkout. */
async function markCustomerCouponUsed({ customerId, couponCode }) {
  const code = normalizeCode(couponCode);
  const coupon = await Coupon.findOne({ code });
  if (!coupon || coupon.audience !== 'customer_specific') return;

  await CustomerCoupon.updateOne(
    { customerId, couponId: coupon._id, status: 'active' },
    { $set: { status: 'used', usedAt: new Date() } },
  );
}

/** Build the Booking.coupon subdocument from a code sent by the customer app. */
async function persistableCouponFromCode({
  code,
  amountBeforeDiscount,
  chargedTotal,
}) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const coupon = await Coupon.findOne({ code: normalized });
  let discount = 0;
  if (coupon && Number.isFinite(Number(amountBeforeDiscount)) && amountBeforeDiscount > 0) {
    const window = couponIsInDateWindow(coupon);
    if (window.ok && amountBeforeDiscount >= (coupon.minPurchaseAmount || 0)) {
      discount = (amountBeforeDiscount * (coupon.discountPercent || 0)) / 100;
      if (coupon.maxDiscountAmount) discount = Math.min(discount, coupon.maxDiscountAmount);
      discount = Math.round(discount);
    }
  }

  const before = Number(amountBeforeDiscount);
  const charged = Number(chargedTotal);
  if (Number.isFinite(before) && Number.isFinite(charged)) {
    const fromTotals = Math.max(0, Math.round(before - charged));
    if (fromTotals > 0) discount = fromTotals;
  }

  return {
    couponRef: coupon?._id || null,
    code: coupon?.code || normalized,
    discountAmount: discount,
    appliedAt: new Date(),
  };
}

module.exports = {
  assignCouponToCustomer,
  getActiveCouponsForCustomer,
  validateCouponForCheckout,
  markCustomerCouponUsed,
  persistableCouponFromCode,
};
