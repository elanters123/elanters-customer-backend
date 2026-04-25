// models/CustomerOTP.js
// Customer-specific OTP records. Separate from gardener OTPverification.

const mongoose = require('mongoose');

const customerOTPSchema = new mongoose.Schema({
  phone:      { type: String, required: true, index: true },
  otp:        { type: String, required: true },
  expiryTime: { type: Date, required: true },
  status:     { type: String, enum: ['Pending', 'Verified', 'Expired'], default: 'Pending' },
}, { timestamps: true });

module.exports = mongoose.model('CustomerOTP', customerOTPSchema);
