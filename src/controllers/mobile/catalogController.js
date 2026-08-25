// controllers/mobile/catalogController.js
const Item = require('../../models/Item');
const PincodeAvailability = require('../../models/PincodeAvailability');
const CustomerWishlist = require('../../models/CustomerWishlist');
const productReviewService = require('../../services/productReviewService');
const { attachResolvedImages } = require('../../services/productImageService');

function attachReviewSummary(item, summaries) {
  const plain = item.toObject ? item.toObject() : item;
  const key = String(plain._id);
  const s = summaries.get(key) || { avgRating: 0, reviewCount: 0 };
  return { ...plain, avgRating: s.avgRating, reviewCount: s.reviewCount };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One-edit variants so "fiscus" still finds "Ficus". */
function typoVariants(raw) {
  const compact = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const variants = new Set();
  if (!compact) return [];
  variants.add(compact);
  if (compact.length >= 4 && compact.length <= 16) {
    for (let i = 0; i < compact.length; i += 1) {
      variants.add(compact.slice(0, i) + compact.slice(i + 1));
    }
    for (let i = 0; i < compact.length - 1; i += 1) {
      const chars = compact.split('');
      const tmp = chars[i];
      chars[i] = chars[i + 1];
      chars[i + 1] = tmp;
      variants.add(chars.join(''));
    }
  }
  return [...variants].filter(Boolean);
}

/**
 * Catalog search: substring match + light typo tolerance (e.g. "fiscus" → "Ficus").
 * Also matches shortDescription so common search terms still hit.
 */
function buildSearchClause(search) {
  const raw = String(search || '').trim();
  if (!raw) return null;

  const clauses = [];
  const escaped = escapeRegex(raw);
  clauses.push({ name: { $regex: escaped, $options: 'i' } });
  clauses.push({ shortDescription: { $regex: escaped, $options: 'i' } });

  const tokens = raw.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    clauses.push({
      $and: tokens.map((t) => ({ name: { $regex: escapeRegex(t), $options: 'i' } })),
    });
  }

  for (const variant of typoVariants(raw)) {
    if (variant.toLowerCase() === raw.replace(/[^a-z0-9]+/gi, '').toLowerCase()) continue;
    const re = escapeRegex(variant);
    clauses.push({ name: { $regex: re, $options: 'i' } });
  }

  return { $or: clauses };
}

/** Admin uses both "Plant" and "Plants" (and similar). Apps usually send one spelling. */
function expandCategoryFilter(category) {
  const raw = String(category || '').trim();
  if (!raw) return null;
  const aliases = {
    plants: ['Plants', 'Plant'],
    plant: ['Plant', 'Plants'],
    pots: ['Pots', 'Pot'],
    pot: ['Pot', 'Pots'],
    fertilizer: ['Fertilizer', 'Fertilizers'],
    fertilizers: ['Fertilizers', 'Fertilizer'],
  };
  const key = raw.toLowerCase();
  const list = aliases[key] || [raw];
  const unique = [...new Set(list)];
  if (unique.length === 1) return { category: unique[0] };
  return { category: { $in: unique } };
}

/**
 * Catalog visibility filter.
 * Missing/null visibility treated as "both" (legacy default).
 * @param {'customer'|'gardener'} audience
 */
function visibilityFilterForAudience(audience) {
  const allowed = audience === 'gardener' ? ['both', 'gardener'] : ['both', 'customer'];
  return {
    $or: [
      { visibility: { $in: allowed } },
      { visibility: { $exists: false } },
      { visibility: null },
    ],
  };
}

function normalizeAudience(raw) {
  const v = String(raw || 'customer').trim().toLowerCase();
  return v === 'gardener' ? 'gardener' : 'customer';
}

function isItemVisibleToAudience(item, audience) {
  const v = item?.visibility;
  if (v == null || v === '') return true; // legacy = both
  if (v === 'none') return false;
  if (v === 'both') return true;
  return v === audience;
}

const getProducts = async (req, res) => {
  try {
    const { category, page = 1, limit = 20, search, audience } = req.query;
    const and = [];
    const categoryFilter = expandCategoryFilter(category);
    if (categoryFilter) and.push(categoryFilter);
    const searchClause = buildSearchClause(search);
    if (searchClause) and.push(searchClause);
    and.push(visibilityFilterForAudience(normalizeAudience(audience)));
    const query = and.length === 1 ? and[0] : { $and: and };

    // Match admin item-list default: sort by name ascending
    const items = await Item.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    const summaries = await productReviewService.getSummariesForProductIds(items.map((i) => i._id));
    let enriched = items.map((item) => attachReviewSummary(item, summaries));
    enriched = await attachResolvedImages(enriched, req);

    const total = await Item.countDocuments(query);
    res.json({ success: true, items: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const audience = normalizeAudience(req.query.audience);
    const item = await Item.findById(req.params.id).select('-__v');
    if (!item) return res.status(404).json({ success: false, message: 'Product not found' });
    if (!isItemVisibleToAudience(item, audience)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { summary, reviews } = await productReviewService.listProductReviews(req.params.id, {
      limit: 50,
    });
    const [plain] = await attachResolvedImages(
      [{ ...item.toObject(), avgRating: summary.avgRating, reviewCount: summary.reviewCount }],
      req
    );
    res.json({
      success: true,
      item: plain,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const checkPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const result = await PincodeAvailability.findOne({ pincode, active: true });
    res.json({
      success: true,
      available: !!result,
      services: result?.servicesAvailable || [],
      city: result?.city || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWishlist = async (req, res) => {
  try {
    const wishlist = await CustomerWishlist.findOne({ customerId: req.customerId }).populate(
      'productIds',
      'name price images imageIds offer'
    );
    const products = await attachResolvedImages(wishlist?.productIds || [], req);
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    let wishlist = await CustomerWishlist.findOne({ customerId: req.customerId });
    if (!wishlist) wishlist = new CustomerWishlist({ customerId: req.customerId, productIds: [] });

    const idx = wishlist.productIds.findIndex((id) => id.toString() === productId);
    let action;
    if (idx > -1) {
      wishlist.productIds.splice(idx, 1);
      action = 'removed';
    } else {
      wishlist.productIds.push(productId);
      action = 'added';
    }

    await wishlist.save();
    res.json({ success: true, action, productIds: wishlist.productIds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProducts, getProductById, checkPincode, getWishlist, toggleWishlist };
