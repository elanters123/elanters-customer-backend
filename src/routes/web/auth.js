const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { sendOTP, verifyOTP, logout, refreshToken } = require('../../controllers/web/authController');

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Too many OTP requests' });

router.post('/send-otp', otpLimiter, sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/logout', logout);
router.post('/refresh', refreshToken);

module.exports = router;
