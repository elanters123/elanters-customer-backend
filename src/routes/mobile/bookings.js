const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  createBooking, getMyBookings, getBookingById,
  cancelBooking, verifyServiceOTP, applyCoupon, submitRating,
  uploadBalconyPhoto, getBalconyPhoto,
} = require('../../controllers/mobile/bookingController');

router.post('/', auth, createBooking);
router.get('/', auth, getMyBookings);
router.post('/apply-coupon', auth, applyCoupon);
router.get('/:id/balcony-photo', auth, getBalconyPhoto);
router.post('/:id/balcony-photo', auth, uploadBalconyPhoto);
router.get('/:id', auth, getBookingById);
router.patch('/:id/cancel', auth, cancelBooking);
router.post('/:id/verify-otp', auth, verifyServiceOTP);
router.post('/:id/rating', auth, submitRating);

module.exports = router;
