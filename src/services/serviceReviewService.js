const ServiceReview = require('../models/ServiceReview');
const Customer = require('../models/Customer');

const ALLOWED_SERVICE_KEYS = new Set(['home-gardener', 'villa-gardener', 'grass-cutting']);

function normalizeServiceKey(key) {
  const k = String(key || 'home-gardener').trim().toLowerCase();
  if (!ALLOWED_SERVICE_KEYS.has(k)) {
    throw new Error(`serviceKey must be one of: ${[...ALLOWED_SERVICE_KEYS].join(', ')}`);
  }
  return k;
}

function formatDisplayDate(d) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function mapReview(doc) {
  return {
    id: String(doc._id),
    customerName: doc.customerName,
    rating: doc.rating,
    text: doc.text,
    createdAt: doc.createdAt,
    displayDate: formatDisplayDate(doc.createdAt),
  };
}

function buildSummary(reviews) {
  if (!reviews.length) {
    return { averageStars: 0, reviewCount: 0 };
  }
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const averageStars = Math.round((sum / reviews.length) * 10) / 10;
  return { averageStars, reviewCount: reviews.length };
}

async function listServiceReviews(serviceKey, { limit = 50 } = {}) {
  const key = normalizeServiceKey(serviceKey);

  const docs = await ServiceReview.find({ serviceKey: key })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();

  const reviews = docs.map(mapReview);
  return {
    serviceKey: key,
    summary: buildSummary(reviews),
    reviews,
  };
}

async function createServiceReview({ serviceKey, customerId, rating, text }) {
  const key = normalizeServiceKey(serviceKey);
  const score = Math.round(Number(rating));
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    throw new Error('rating must be between 1 and 5');
  }
  const body = String(text || '').trim();
  if (!body) throw new Error('text is required');

  const customer = await Customer.findById(customerId).select('name');
  if (!customer) throw new Error('Customer not found');

  const customerName = (customer.name && String(customer.name).trim()) || 'Customer';

  const doc = await ServiceReview.create({
    serviceKey: key,
    customerId,
    customerName,
    rating: score,
    text: body,
  });

  return mapReview(doc);
}

module.exports = {
  listServiceReviews,
  createServiceReview,
  ALLOWED_SERVICE_KEYS,
};
