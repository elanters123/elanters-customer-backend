const productReviewService = require('../../services/productReviewService');

const listProductReviews = async (req, res) => {
  try {
    const { productId, limit } = req.query;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    const data = await productReviewService.listProductReviews(productId, {
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const createProductReview = async (req, res) => {
  try {
    const { productId, rating, text, review } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    const reviewDoc = await productReviewService.createProductReview({
      productId,
      customerId: req.customerId,
      rating,
      text: text ?? review,
    });
    res.status(201).json({ success: true, review: reviewDoc });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { listProductReviews, createProductReview };
