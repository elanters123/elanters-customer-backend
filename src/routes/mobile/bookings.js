const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  createBooking, getMyBookings, getBookingById,
  cancelBooking, verifyServiceOTP, applyCoupon, submitRating,
} = require('../../controllers/mobile/bookingController');

router.post('/', auth, createBooking);
router.get('/', auth, getMyBookings);
router.get('/:id', auth, getBookingById);
router.patch('/:id/cancel', auth, cancelBooking);
router.post('/:id/verify-otp', auth, verifyServiceOTP);
router.post('/apply-coupon', auth, applyCoupon);
router.post('/:id/rating', auth, submitRating);

module.exports = router;
