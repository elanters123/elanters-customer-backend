// controllers/web/authController.js
// Handles OTP auth for web. Sets HttpOnly cookie on verify.

const authService = require('../../services/authService');

const WEB_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

    await authService.initiateCustomerOTP(phone);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

    const { customer, token, isNewUser } = await authService.verifyCustomerOTP(phone, otp);

    // Set token in HttpOnly cookie for web
    res.cookie('customerToken', token, WEB_COOKIE_OPTIONS);

    res.json({
      success: true,
      isNewUser,
      customer: {
        id: customer._id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        profilePhoto: customer.profilePhoto,
        walletBalance: customer.walletBalance,
        referralCode: customer.referralCode,
      },
    });
  } catch (error) {
    const status = error.message === 'Invalid OTP' || error.message === 'OTP expired' ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

const logout = (req, res) => {
  res.clearCookie('customerToken', { httpOnly: true, sameSite: 'none', secure: true });
  res.json({ success: true, message: 'Logged out' });
};

const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.customerRefreshToken || req.body?.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token missing' });

    const { token } = await authService.refreshCustomerToken(refreshToken);
    res.cookie('customerToken', token, WEB_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

module.exports = { sendOTP, verifyOTP, logout, refreshToken };
