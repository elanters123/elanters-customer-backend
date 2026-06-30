const mongoose = require('mongoose');
const ProductReview = require('../models/ProductReview');
const Item = require('../models/Item');
const Customer = require('../models/Customer');

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
    return { averageStars: 0, reviewCount: 0, avgRating: 0 };
  }
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const averageStars = Math.round((sum / reviews.length) * 10) / 10;
  return { averageStars, reviewCount: reviews.length, avgRating: averageStars };
}

function normalizeProductId(productId) {
  const id = String(productId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('productId is required and must be a valid id');
  }
  return id;
}

async function assertProductExists(productId) {
  const exists = await Item.exists({ _id: productId });
  if (!exists) throw new Error('Product not found');
}

async function listProductReviews(productId, { limit = 50 } = {}) {
  const id = normalizeProductId(productId);
  await assertProductExists(id);

  const docs = await ProductReview.find({ productId: id })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();

  const reviews = docs.map(mapReview);
  const summary = buildSummary(reviews);
  return {
    productId: id,
    summary,
    reviews,
  };
}

async function createProductReview({ productId, customerId, rating, text }) {
  const id = normalizeProductId(productId);
  await assertProductExists(id);

  const score = Math.round(Number(rating));
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    throw new Error('rating must be between 1 and 5');
  }
  const body = String(text || '').trim();
  if (!body) throw new Error('text is required');

  const customer = await Customer.findById(customerId).select('name');
  if (!customer) throw new Error('Customer not found');

  const customerName = (customer.name && String(customer.name).trim()) || 'Customer';

  const doc = await ProductReview.create({
    productId: id,
    customerId,
    customerName,
    rating: score,
    text: body,
  });

  return mapReview(doc);
}

/** @returns {Promise<Map<string, { avgRating: number, reviewCount: number }>>} */
async function getSummariesForProductIds(productIds) {
  const ids = [...new Set(productIds.map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const map = new Map();
  if (!ids.length) return map;

  const rows = await ProductReview.aggregate([
    { $match: { productId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $group: {
        _id: '$productId',
        avgRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  for (const row of rows) {
    const key = String(row._id);
    map.set(key, {
      avgRating: Math.round(row.avgRating * 10) / 10,
      reviewCount: row.reviewCount,
    });
  }
  return map;
}

module.exports = {
  listProductReviews,
  createProductReview,
  getSummariesForProductIds,
};
