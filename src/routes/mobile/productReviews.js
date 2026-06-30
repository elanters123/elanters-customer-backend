const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  listProductReviews,
  createProductReview,
} = require('../../controllers/mobile/productReviewController');

router.get('/', listProductReviews);
router.post('/', auth, createProductReview);

module.exports = router;
