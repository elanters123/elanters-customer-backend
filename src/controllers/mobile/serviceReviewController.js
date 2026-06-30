const serviceReviewService = require('../../services/serviceReviewService');

const listServiceReviews = async (req, res) => {
  try {
    const { serviceKey = 'home-gardener', limit } = req.query;
    const data = await serviceReviewService.listServiceReviews(serviceKey, {
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const createServiceReview = async (req, res) => {
  try {
    const { serviceKey = 'home-gardener', rating, text, review } = req.body;
    const reviewDoc = await serviceReviewService.createServiceReview({
      serviceKey,
      customerId: req.customerId,
      rating,
      text: text ?? review,
    });
    res.status(201).json({ success: true, review: reviewDoc });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { listServiceReviews, createServiceReview };
