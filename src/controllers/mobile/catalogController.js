// controllers/mobile/catalogController.js
const Item = require('../../models/Item');
const PincodeAvailability = require('../../models/PincodeAvailability');
const CustomerWishlist = require('../../models/CustomerWishlist');
const productReviewService = require('../../services/productReviewService');

function attachReviewSummary(item, summaries) {
  const plain = item.toObject ? item.toObject() : item;
  const key = String(plain._id);
  const s = summaries.get(key) || { avgRating: 0, reviewCount: 0 };
  return { ...plain, avgRating: s.avgRating, reviewCount: s.reviewCount };
}

const getProducts = async (req, res) => {
  try {
    const { category, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (category) query.category = category;
    if (search) query.name = { $regex: search, $options: 'i' };

    const items = await Item.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-__v');

    const summaries = await productReviewService.getSummariesForProductIds(items.map((i) => i._id));
    const enriched = items.map((item) => attachReviewSummary(item, summaries));

    const total = await Item.countDocuments(query);
    res.json({ success: true, items: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).select('-__v');
    if (!item) return res.status(404).json({ success: false, message: 'Product not found' });

    const { summary, reviews } = await productReviewService.listProductReviews(req.params.id, {
      limit: 50,
    });
    const plain = item.toObject();
    res.json({
      success: true,
      item: {
        ...plain,
        avgRating: summary.avgRating,
        reviewCount: summary.reviewCount,
      },
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
      'name price images offer'
    );
    res.json({ success: true, products: wishlist?.productIds || [] });
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
