const Razorpay = require('razorpay');

function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || process.env.RAZ_ID || '';
}

function razorpayKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET || process.env.RAZ_SECRET || '';
}

exports.createRazorpayInstance = () =>
  new Razorpay({
    key_id: razorpayKeyId(),
    key_secret: razorpayKeySecret(),
  });

exports.getRazorpayKeyId = razorpayKeyId;
exports.getRazorpayKeySecret = razorpayKeySecret;
