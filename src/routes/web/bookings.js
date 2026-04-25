const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  createBooking, getMyBookings, getBookingById,
  cancelBooking, applyCoupon, submitRating,
} = require('../../controllers/web/bookingController');

router.post('/', auth, createBooking);
router.get('/', auth, getMyBookings);
router.get('/:id', auth, getBookingById);
router.patch('/:id/cancel', auth, cancelBooking);
router.post('/apply-coupon', auth, applyCoupon);
router.post('/:id/rating', auth, submitRating);

module.exports = router;
