// services/customerAuthService.js
// Handles OTP generation, Fast2SMS delivery, JWT signing for customer app.
// Reuses the existing Fast2SMS DLT route and sender ID (ELNTER).

const jwt    = require('jsonwebtoken');
const unirest = require('unirest');
const Customer   = require('../models/Customer.js');
const CustomerOTP = require('../models/CustomerOTP.js');
const CustomerPushToken = require('../models/CustomerPushToken.js');
const { applyReferralCodeAtSignup } = require('./referralService');

const generateOTP = () =>
  process.env.NODE_ENV !== 'production'
    ? '123456'                                        // fixed OTP in dev/test
    : Math.floor(100000 + Math.random() * 900000).toString();

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
  // Rate limiting: max 5 OTPs per phone per 10 min — enforced at route level via express-rate-limit
  const otp = generateOTP();
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await CustomerOTP.deleteMany({ phone });
  await CustomerOTP.create({ phone, otp, expiryTime: expiry, status: 'Pending' });

  const sendRealSms =
    process.env.NODE_ENV === 'production' || process.env.OTP_SEND_SMS === 'true';
  if (sendRealSms) {
    await sendSMSOTP(phone, otp);
  } else {
    console.log(`[CustomerAuth DEV] OTP for ${phone}: ${otp} (SMS not sent — set OTP_SEND_SMS=true to send)`);
  }
  return {
    status: 'success',
    devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    smsSent: sendRealSms,
  };
};

const verifyCustomerOTP = async (phone, otp, options = {}) => {
  const { referralCode } = options;
  const record = await CustomerOTP.findOne({ phone, otp, status: 'Pending' });
  if (!record) throw new Error('Invalid OTP');
  if (record.expiryTime < new Date()) {
    await CustomerOTP.updateOne({ _id: record._id }, { status: 'Expired' });
    throw new Error('OTP expired');
  }
  await CustomerOTP.deleteMany({ phone });

  // Upsert customer — first login creates the record
  let customer = await Customer.findOne({ phoneNumber: phone });
  const isNewUser = !customer;
  if (!customer) customer = await Customer.create({ phoneNumber: phone });
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
