const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  listServiceReviews,
  createServiceReview,
} = require('../../controllers/web/serviceReviewController');

router.get('/', listServiceReviews);
router.post('/', auth, createServiceReview);

module.exports = router;
