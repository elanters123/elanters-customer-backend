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

exports.assertRazorpayConfigured = () => {
  const keyId = razorpayKeyId();
  const keySecret = razorpayKeySecret();
  if (!keyId && !keySecret) {
    const err = new Error(
      'Online payment is not configured on the server. For gardener visits you can use Cash on delivery.',
    );
    err.status = 503;
    throw err;
  }
  if (!keyId) {
    const err = new Error(
      'Razorpay Key ID is missing on the server (set RAZ_ID or RAZORPAY_KEY_ID).',
    );
    err.status = 503;
    throw err;
  }
  if (!keySecret) {
    const err = new Error(
      'Razorpay Key Secret is missing on the server (set RAZ_SECRET or RAZORPAY_KEY_SECRET in elanters-backend .env).',
    );
    err.status = 503;
    throw err;
  }
};

exports.formatRazorpayError = (error) => {
  if (!error) return 'Payment gateway error';
  if (typeof error === 'string') return error;
  return (
    error.error?.description ||
    error.description ||
    error.message ||
    'Payment gateway error'
  );
};
