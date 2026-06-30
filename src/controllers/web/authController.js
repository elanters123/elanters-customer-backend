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

    const result = await authService.initiateCustomerOTP(phone);
    const payload = { success: true, message: 'OTP sent successfully' };
    if (process.env.NODE_ENV !== 'production' && result.devOtp) {
      payload.devOtp = result.devOtp;
      payload.smsSent = false;
    } else {
      payload.smsSent = true;
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { phone, otp, referralCode } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

    const { customer, token, isNewUser } = await authService.verifyCustomerOTP(phone, otp, {
      referralCode,
    });

    // Set token in HttpOnly cookie for web
    res.cookie('customerToken', token, WEB_COOKIE_OPTIONS);

    res.json({
      success: true,
      isNewUser,
      customer: {
        id: customer._id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
        emailId: customer.emailId,
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

const logout = async (req, res) => {
  res.clearCookie('customerToken', { httpOnly: true, sameSite: 'none', secure: true });
  res.clearCookie('customerRefreshToken', { httpOnly: true, sameSite: 'none', secure: true });

  let customerId = req.customerId;
  if (!customerId) {
    const token = req.cookies?.customerToken;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);
        customerId = decoded.customerId;
      } catch {
        customerId = null;
      }
    }
  }

  if (customerId) {
    try {
      await authService.logoutCustomer(customerId);
    } catch {
      /* still return success after cookies cleared */
    }
  }

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
