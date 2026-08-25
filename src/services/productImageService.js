// services/productImageService.js
// Resolve item.imageIds → public media URLs (or legacy item.images fallback).

const ProductImage = require('../models/ProductImage');

function servicePrefix() {
  return (process.env.SERVICE_PREFIX || 'customer').replace(/^\/|\/$/g, '');
}

/** Public API base used to build media URLs for clients (Image / <img src>). */
function publicApiBase(req) {
  const proto = (req?.get?.('x-forwarded-proto') || req?.protocol || 'http').split(',')[0].trim();
  const host = (req?.get?.('x-forwarded-host') || req?.get?.('host') || 'localhost').split(',')[0].trim();
  const fromRequest = `${proto}://${host}/${servicePrefix()}/api`;

  const fromEnv = (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_BASE || '').replace(/\/$/, '');
  if (!fromEnv) return fromRequest;

  // Prefer request host when env omitted the non-default port (common misconfig → broken images).
  try {
    const envUrl = new URL(fromEnv.includes('://') ? fromEnv : `${proto}://${fromEnv}`);
    const reqHost = host.includes(':') ? host : `${host}`;
    const reqPort = reqHost.includes(':') ? reqHost.split(':').pop() : '';
    if (!envUrl.port && reqPort && reqPort !== '80' && reqPort !== '443') {
      return fromRequest;
    }
  } catch {
    /* keep env */
  }
  return fromEnv;
}

function mediaUrlForId(imageId, req) {
  return `${publicApiBase(req)}/media/product-images/${imageId}`;
}

function toPlain(item) {
  if (!item) return item;
  if (typeof item.toObject === 'function') return item.toObject();
  return item;
}

/**
 * For each item with imageIds, set `images` to public media URLs.
 * Keeps legacy `images` when imageIds is empty.
 * Mutates plain objects; returns the same array.
 */
async function attachResolvedImages(items, req) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!list.length) return list;

  const plains = list.map(toPlain);
  const allIds = [];
  for (const p of plains) {
    for (const id of p.imageIds || []) {
      if (id) allIds.push(String(id));
    }
  }
  const uniqueIds = [...new Set(allIds)];
  if (!uniqueIds.length) return plains;

  const existing = await ProductImage.find({ _id: { $in: uniqueIds } })
    .select('_id')
    .lean();
  const ok = new Set(existing.map((d) => String(d._id)));

  for (const p of plains) {
    const ids = (p.imageIds || []).map((id) => String(id)).filter((id) => ok.has(id));
    if (ids.length) {
      p.images = ids.map((id) => mediaUrlForId(id, req));
    } else if (!Array.isArray(p.images)) {
      p.images = [];
    }
  }
  return plains;
}

async function attachResolvedImagesToCart(cart, req) {
  if (!cart) return cart;
  const plain = toPlain(cart);
  const products = (plain.items || [])
    .map((line) => line.productId)
    .filter((p) => p && typeof p === 'object');
  if (products.length) {
    const resolved = await attachResolvedImages(products, req);
    const byId = new Map(resolved.map((p) => [String(p._id), p]));
    for (const line of plain.items) {
      if (line.productId && typeof line.productId === 'object') {
        const id = String(line.productId._id || line.productId);
        if (byId.has(id)) line.productId = byId.get(id);
      }
    }
  }
  return plain;
}

module.exports = {
  publicApiBase,
  mediaUrlForId,
  attachResolvedImages,
  attachResolvedImagesToCart,
};
