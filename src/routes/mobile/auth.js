const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { sendOTP, verifyOTP, refreshToken } = require('../../controllers/mobile/authController');

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Too many OTP requests' });

router.post('/send-otp', otpLimiter, sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/refresh', refreshToken);

module.exports = router;
