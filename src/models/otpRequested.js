const mongoose = require('mongoose');

const otpRequestedSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  customerNumber:{
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
    maxlength: 6,
    minlength: 6,
  },
  expiryTime: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Verified', 'Expired'],
    default: 'Pending',
    required: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
});

otpRequestedSchema.index({ userId: 1, expiryTime: 1 });

module.exports = mongoose.model('OTPRequested', otpRequestedSchema);