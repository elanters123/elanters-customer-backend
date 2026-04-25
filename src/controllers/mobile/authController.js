// controllers/mobile/authController.js
// Handles OTP auth for Android/iOS. Returns token in response body (no cookies).

const authService = require('../../services/authService');

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

    const { customer, token, refreshToken, isNewUser } = await authService.verifyCustomerOTP(phone, otp);

    // Return tokens in body for mobile storage (AsyncStorage / SecureStore)
    res.json({
      success: true,
      isNewUser,
      token,
      refreshToken,
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

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token missing' });

    const { token } = await authService.refreshCustomerToken(refreshToken);
    res.json({ success: true, token });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

module.exports = { sendOTP, verifyOTP, refreshToken };
