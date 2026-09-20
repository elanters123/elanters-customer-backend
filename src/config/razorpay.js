const Razorpay = require('razorpay');

function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || process.env.RAZ_ID || '';
}

function razorpayKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET || process.env.RAZ_SECRET || '';
}

/** Safe preview: first/last chars only — never log full key/secret. */
function maskCredential(value, head = 6, tail = 4) {
  const s = String(value || '');
  if (!s) return { present: false, length: 0, head: '', tail: '', preview: '(empty)' };
  if (s.length <= head + tail) {
    return {
      present: true,
      length: s.length,
      head: s.slice(0, Math.min(2, s.length)),
      tail: s.slice(-Math.min(2, s.length)),
      preview: `${s.slice(0, 2)}…${s.slice(-2)} (len=${s.length})`,
    };
  }
  const h = s.slice(0, head);
  const t = s.slice(-tail);
  return {
    present: true,
    length: s.length,
    head: h,
    tail: t,
    preview: `${h}…${t} (len=${s.length})`,
  };
}

function getRazorpayCredentialFingerprint() {
  const id = maskCredential(razorpayKeyId(), 8, 4);
  const secret = maskCredential(razorpayKeySecret(), 4, 4);
  return {
    keyIdPreview: id.preview,
    keyIdLen: id.length,
    keyIdHead: id.head,
    keyIdTail: id.tail,
    keySecretPreview: secret.preview,
    keySecretLen: secret.length,
    keySecretHead: secret.head,
    keySecretTail: secret.tail,
    envSource: {
      keyId: process.env.RAZORPAY_KEY_ID
        ? 'RAZORPAY_KEY_ID'
        : process.env.RAZ_ID
          ? 'RAZ_ID'
          : 'missing',
      keySecret: process.env.RAZORPAY_KEY_SECRET
        ? 'RAZORPAY_KEY_SECRET'
        : process.env.RAZ_SECRET
          ? 'RAZ_SECRET'
          : 'missing',
    },
  };
}

exports.createRazorpayInstance = () =>
  new Razorpay({
    key_id: razorpayKeyId(),
    key_secret: razorpayKeySecret(),
  });

exports.getRazorpayKeyId = razorpayKeyId;
exports.getRazorpayKeySecret = razorpayKeySecret;
exports.maskCredential = maskCredential;
exports.getRazorpayCredentialFingerprint = getRazorpayCredentialFingerprint;

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
