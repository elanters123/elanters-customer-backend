// services/customerAuthService.js
// Handles OTP generation, Fast2SMS delivery, JWT signing for customer app.
// Reuses the existing Fast2SMS DLT route and sender ID (ELNTER).

const jwt    = require('jsonwebtoken');
const unirest = require('unirest');
const Customer   = require('../models/Customer.js');
const CustomerOTP = require('../models/CustomerOTP.js');
const CustomerPushToken = require('../models/CustomerPushToken.js');
const { applyReferralCodeAtSignup } = require('./referralService');

/** Last 10 digits — app may send 7065432173 or +917065432173. */
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

/**
 * Google Play review login: fixed OTP for allowlisted phones only.
 * Env (optional):
 *   PLAY_REVIEW_PHONES=7065432173,9999999999
 *   PLAY_REVIEW_OTP=123456
 */
const PLAY_REVIEW_OTP = String(process.env.PLAY_REVIEW_OTP || '123456').trim();
const PLAY_REVIEW_PHONES = new Set(
  String(process.env.PLAY_REVIEW_PHONES || '7065432173')
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p) => p.length === 10),
);

const isPlayReviewPhone = (phone) => PLAY_REVIEW_PHONES.has(normalizePhone(phone));

const generateOTP = (phone) => {
  if (isPlayReviewPhone(phone)) return PLAY_REVIEW_OTP;
  return process.env.NODE_ENV !== 'production'
    ? '123456'                                        // fixed OTP in dev/test
    : Math.floor(100000 + Math.random() * 900000).toString();
};

// ─── Send OTP via Fast2SMS (same DLT setup as gardener auth) ─────────────────
const sendSMSOTP = (phone, otp) =>
  new Promise((resolve, reject) => {
    unirest('GET', 'https://www.fast2sms.com/dev/bulkV2')
      .query({
        authorization: process.env.FAST_SMS_API,
        variables_values: otp,
        route: 'dlt',
        sender_id: 'ELNTER',
        message: 185903,
        flash: 0,
        numbers: phone,
      })
      .headers({ 'cache-control': 'no-cache' })
      .end((res) => {
        if (res.error) return reject(new Error('SMS gateway error'));
        if (!res.body?.return) return reject(new Error('Failed to send OTP via Fast2SMS'));
        resolve(true);
      });
  });

// ─── Public API ───────────────────────────────────────────────────────────────

const initiateCustomerOTP = async (phone) => {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) throw new Error('Invalid phone number');

  // Rate limiting: max 5 OTPs per phone per 10 min — enforced at route level via express-rate-limit
  const otp = generateOTP(normalized);
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  const reviewPhone = isPlayReviewPhone(normalized);

  // Store under normalized 10-digit form so verify matches app input variants.
  await CustomerOTP.deleteMany({ phone: { $in: [phone, normalized, `91${normalized}`, `+91${normalized}`] } });
  await CustomerOTP.create({ phone: normalized, otp, expiryTime: expiry, status: 'Pending' });

  const sendRealSms =
    !reviewPhone &&
    (process.env.NODE_ENV === 'production' || process.env.OTP_SEND_SMS === 'true');
  if (sendRealSms) {
    await sendSMSOTP(normalized, otp);
  } else {
    console.log(
      `[CustomerAuth ${reviewPhone ? 'PLAY_REVIEW' : 'DEV'}] OTP for ${normalized}: ${otp}` +
        (reviewPhone ? ' (SMS skipped — Google Play review account)' : ' (SMS not sent — set OTP_SEND_SMS=true to send)'),
    );
  }
  return {
    status: 'success',
    // Never expose OTP in production responses except non-production.
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    smsSent: sendRealSms,
  };
};

const verifyCustomerOTP = async (phone, otp, options = {}) => {
  const { referralCode } = options;
  const normalized = normalizePhone(phone);
  const code = String(otp || '').trim();

  // Play review: accept fixed OTP even if send-otp was skipped / record missing.
  if (isPlayReviewPhone(normalized) && code === PLAY_REVIEW_OTP) {
    await CustomerOTP.deleteMany({
      phone: { $in: [phone, normalized, `91${normalized}`, `+91${normalized}`] },
    });
  } else {
    const record = await CustomerOTP.findOne({
      phone: { $in: [phone, normalized] },
      otp: code,
      status: 'Pending',
    });
    if (!record) throw new Error('Invalid OTP');
    if (record.expiryTime < new Date()) {
      await CustomerOTP.updateOne({ _id: record._id }, { status: 'Expired' });
      throw new Error('OTP expired');
    }
    await CustomerOTP.deleteMany({
      phone: { $in: [phone, normalized, `91${normalized}`, `+91${normalized}`] },
    });
  }

  // Upsert customer — first login creates the record
  let customer = await Customer.findOne({
    phoneNumber: { $in: [normalized, phone, `91${normalized}`, `+91${normalized}`] },
  });
  const isNewUser = !customer;
  if (!customer) customer = await Customer.create({ phoneNumber: normalized });
  if (isNewUser && referralCode) {
    await applyReferralCodeAtSignup({ customerId: customer._id, referralCode });
    customer = await Customer.findById(customer._id);
  }

  const token = signToken(customer);
  const refreshToken = signRefreshToken(customer);
  return { customer, token, refreshToken, isNewUser };
};

const sessionVersionOf = (customer) => customer?.sessionVersion ?? 0;

const signToken = (customer) =>
  jwt.sign(
    { customerId: customer._id.toString(), sessionVersion: sessionVersionOf(customer) },
    process.env.CUSTOMER_JWT_SECRET,
    { expiresIn: '7d' },
  );

const signRefreshToken = (customer) =>
  jwt.sign(
    { customerId: customer._id.toString(), sessionVersion: sessionVersionOf(customer) },
    process.env.CUSTOMER_JWT_REFRESH_SECRET,
    { expiresIn: '30d' },
  );

const assertSessionActive = (customer, decoded) => {
  if (!customer) throw new Error('Customer not found');
  if (customer.accountStatus === 'blocked') throw new Error('Account is blocked');
  const tokenVersion = decoded.sessionVersion ?? 0;
  if (tokenVersion !== sessionVersionOf(customer)) {
    throw new Error('Session ended');
  }
};

const refreshCustomerToken = async (refreshToken) => {
  const decoded = jwt.verify(refreshToken, process.env.CUSTOMER_JWT_REFRESH_SECRET);
  const customer = await Customer.findById(decoded.customerId);
  assertSessionActive(customer, decoded);
  return { token: signToken(customer) };
};

/** End mobile/web session: invalidate tokens and remove push registrations. */
const logoutCustomer = async (customerId, { fcmToken } = {}) => {
  const id = customerId?.toString();
  if (!id) throw new Error('Customer id is required');

  await Customer.findByIdAndUpdate(id, { $inc: { sessionVersion: 1 } });

  if (fcmToken) {
    await CustomerPushToken.deleteMany({ customerId: id, token: fcmToken });
  } else {
    await CustomerPushToken.deleteMany({ customerId: id });
  }

  return { success: true };
};

module.exports = {
  initiateCustomerOTP,
  verifyCustomerOTP,
  refreshCustomerToken,
  logoutCustomer,
  assertSessionActive,
  signToken,
};
