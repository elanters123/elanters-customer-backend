const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../../middleware/auth');
const { sendOTP, verifyOTP, refreshToken, logout } = require('../../controllers/mobile/authController');

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Too many OTP requests' });

router.post('/send-otp', otpLimiter, sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/refresh', refreshToken);
router.post('/logout', auth, logout);

module.exports = router;
