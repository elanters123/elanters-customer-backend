const ElitePlan = require('../models/ElitePlan');

const DEFAULT_PLAN = {
  slug: 'default',
  isActive: true,
  title: 'Elite Membership',
  headline: 'Join Elite Membership & Save More 🌿',
  subtitle: 'Get more value on every gardening service!',
  description:
    'Create your exclusive Elite coupon code and enjoy flat 15% OFF on gardener services and material charges. Discount not applicable on plants.',
  benefits: [
    'Enjoy instant 15% discount on every gardener service',
    'Save more when you book regular garden care',
    'Unique Elite coupon code generated automatically after purchase',
    'Coupon applies at checkout on gardener services & materials (not plants)',
  ],
  mrp: 699,
  salePrice: 299,
  currency: 'INR',
  durationMonths: 6,
  durationLabel: '6 months',
  discountPercent: 15,
  couponCodePrefix: 'ELITE15',
  couponName: 'Elite member discount',
  couponDescription: '15% off gardener services and gardening materials (not plants)',
  checkoutDescription: 'Elite Membership (6 months)',
  imageUrl:
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=200&q=80&auto=format&fit=crop',
  bannerLines: [
    'Flat 15% OFF on every gardener service',
    '₹299 for 6 months · was ₹699',
    'Save ₹400 (57% off) with Elite',
    'Best for frequent gardener bookings',
  ],
  howItWorks: [
    'Buy Elite Membership with secure online payment',
    'Receive your unique member ID and coupon code instantly',
    'Book gardener services and apply your coupon at checkout',
    'Enjoy 15% off on services & materials for 6 months',
  ],
  faq: [
    {
      question: 'What is Elite Membership?',
      answer:
        'Elite is a 6-month membership that gives you a personal coupon code for 15% off gardener services and gardening materials. Plants are excluded.',
    },
    {
      question: 'How is my coupon code created?',
      answer:
        'After successful payment, we generate a unique code (e.g. ELITE15-XXXXXXXX) and assign it to your account automatically.',
    },
    {
      question: 'Can I use Elite with plants or other cart items?',
      answer:
        'Elite must be purchased on its own. The membership discount applies to gardener bookings and eligible material charges, not plants.',
    },
    {
      question: 'How long is the membership valid?',
      answer: 'Your Elite benefits and coupon are valid for 6 months from the purchase date.',
    },
  ],
  version: 1,
};

function formatPlanForClient(doc) {
  if (!doc) return null;
  const p = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    headline: p.headline,
    subtitle: p.subtitle,
    description: p.description,
    benefits: p.benefits || [],
    mrp: p.mrp,
    salePrice: p.salePrice,
    currency: p.currency || 'INR',
    durationMonths: p.durationMonths,
    durationLabel: p.durationLabel,
    discountPercent: p.discountPercent,
    coupon: {
      codePrefix: p.couponCodePrefix,
      name: p.couponName,
      description: p.couponDescription,
      discountPercent: p.discountPercent,
    },
    checkoutDescription: p.checkoutDescription || `Elite Membership (${p.durationLabel})`,
    imageUrl: p.imageUrl || '',
    bannerLines: p.bannerLines || [],
    howItWorks: p.howItWorks || [],
    faq: p.faq || [],
    version: p.version ?? 1,
    updatedAt: p.updatedAt,
  };
}

async function ensureDefaultPlan() {
  let plan = await ElitePlan.findOne({ slug: 'default', isActive: true });
  if (!plan) {
    plan = await ElitePlan.create(DEFAULT_PLAN);
  }
  return plan;
}

async function getActiveElitePlan() {
  const plan = await ElitePlan.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (plan) return plan;
  return ensureDefaultPlan();
}

async function getPublicElitePlan() {
  const plan = await getActiveElitePlan();
  return formatPlanForClient(plan);
}

function normalizeCouponPrefix(prefix) {
  return String(prefix || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function validatePlanInput(input = {}, { partial = false } = {}) {
  const required = partial
    ? []
    : ['headline', 'description', 'mrp', 'salePrice', 'durationMonths', 'durationLabel', 'discountPercent', 'couponCodePrefix'];

  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      const err = new Error(`${field} is required`);
      err.status = 400;
      throw err;
    }
  }

  if (input.mrp != null && Number(input.mrp) < 1) {
    const err = new Error('mrp must be at least 1');
    err.status = 400;
    throw err;
  }
  if (input.salePrice != null && Number(input.salePrice) < 1) {
    const err = new Error('salePrice must be at least 1');
    err.status = 400;
    throw err;
  }
  if (input.mrp != null && input.salePrice != null && Number(input.salePrice) > Number(input.mrp)) {
    const err = new Error('salePrice cannot exceed mrp');
    err.status = 400;
    throw err;
  }
  if (input.discountPercent != null) {
    const pct = Number(input.discountPercent);
    if (pct < 1 || pct > 100) {
      const err = new Error('discountPercent must be between 1 and 100');
      err.status = 400;
      throw err;
    }
  }
  if (input.couponCodePrefix != null && !normalizeCouponPrefix(input.couponCodePrefix)) {
    const err = new Error('couponCodePrefix must contain letters or numbers');
    err.status = 400;
    throw err;
  }
}

function buildPlanPayload(body = {}) {
  const payload = {};
  const assign = (key, value) => {
    if (value !== undefined) payload[key] = value;
  };

  assign('slug', body.slug?.trim() || undefined);
  assign('isActive', body.isActive);
  assign('title', body.title);
  assign('headline', body.headline);
  assign('subtitle', body.subtitle);
  assign('description', body.description);
  assign('benefits', body.benefits);
  assign('mrp', body.mrp != null ? Number(body.mrp) : undefined);
  assign('salePrice', body.salePrice != null ? Number(body.salePrice) : undefined);
  assign('currency', body.currency);
  assign('durationMonths', body.durationMonths != null ? Number(body.durationMonths) : undefined);
  assign('durationLabel', body.durationLabel);
  assign('discountPercent', body.discountPercent != null ? Number(body.discountPercent) : undefined);
  assign('couponCodePrefix', body.couponCodePrefix != null ? normalizeCouponPrefix(body.couponCodePrefix) : undefined);
  assign('couponName', body.couponName);
  assign('couponDescription', body.couponDescription);
  assign('checkoutDescription', body.checkoutDescription);
  assign('imageUrl', body.imageUrl);
  assign('bannerLines', body.bannerLines);
  assign('howItWorks', body.howItWorks);
  assign('faq', body.faq);
  assign('version', body.version != null ? Number(body.version) : undefined);

  return payload;
}

async function deactivateOtherPlans(exceptId) {
  await ElitePlan.updateMany(
    { _id: { $ne: exceptId }, isActive: true },
    { $set: { isActive: false } },
  );
}

async function listElitePlans() {
  const plans = await ElitePlan.find().sort({ updatedAt: -1 });
  return plans.map(formatPlanForClient);
}

async function getElitePlanById(planId) {
  const plan = await ElitePlan.findById(planId);
  if (!plan) {
    const err = new Error('Elite plan not found');
    err.status = 404;
    throw err;
  }
  return formatPlanForClient(plan);
}

async function createElitePlan(body = {}) {
  validatePlanInput(body);
  const payload = buildPlanPayload(body);
  if (!payload.slug) payload.slug = `plan-${Date.now()}`;

  const existingSlug = await ElitePlan.findOne({ slug: payload.slug });
  if (existingSlug) {
    const err = new Error('An Elite plan with this slug already exists');
    err.status = 409;
    throw err;
  }

  if (payload.isActive === undefined) payload.isActive = true;
  if (!payload.title) payload.title = 'Elite Membership';
  if (!payload.currency) payload.currency = 'INR';
  if (!payload.couponName) payload.couponName = 'Elite member discount';
  if (!payload.checkoutDescription && payload.durationLabel) {
    payload.checkoutDescription = `Elite Membership (${payload.durationLabel})`;
  }
  if (payload.version == null) payload.version = 1;

  const plan = await ElitePlan.create(payload);
  if (plan.isActive) {
    await deactivateOtherPlans(plan._id);
  }
  return formatPlanForClient(plan);
}

async function updateElitePlan(planId, body = {}) {
  validatePlanInput(body, { partial: true });
  const plan = await ElitePlan.findById(planId);
  if (!plan) {
    const err = new Error('Elite plan not found');
    err.status = 404;
    throw err;
  }

  if (body.slug && body.slug !== plan.slug) {
    const existingSlug = await ElitePlan.findOne({ slug: body.slug, _id: { $ne: planId } });
    if (existingSlug) {
      const err = new Error('An Elite plan with this slug already exists');
      err.status = 409;
      throw err;
    }
  }

  const payload = buildPlanPayload(body);
  const pricingChanged =
    payload.mrp != null ||
    payload.salePrice != null ||
    payload.discountPercent != null ||
    payload.couponCodePrefix != null ||
    payload.durationMonths != null;

  Object.assign(plan, payload);
  if (pricingChanged && body.version == null) {
    plan.version = (plan.version ?? 1) + 1;
  }
  await plan.save();

  if (plan.isActive) {
    await deactivateOtherPlans(plan._id);
  }

  return formatPlanForClient(plan);
}

module.exports = {
  DEFAULT_PLAN,
  formatPlanForClient,
  getActiveElitePlan,
  getPublicElitePlan,
  ensureDefaultPlan,
  listElitePlans,
  getElitePlanById,
  createElitePlan,
  updateElitePlan,
};
