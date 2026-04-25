// services/customerAuthService.js
// Handles OTP generation, Fast2SMS delivery, JWT signing for customer app.
// Reuses the existing Fast2SMS DLT route and sender ID (ELNTER).

const jwt    = require('jsonwebtoken');
const unirest = require('unirest');
const Customer   = require('../models/Customer.js');
const CustomerOTP = require('../models/CustomerOTP.js');

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

  if (process.env.NODE_ENV === 'production') {
    await sendSMSOTP(phone, otp);
  } else {
    console.log(`[CustomerAuth DEV] OTP for ${phone}: ${otp}`);
  }
  return { status: 'success' };
};

const verifyCustomerOTP = async (phone, otp) => {
  const record = await CustomerOTP.findOne({ phone, otp, status: 'Pending' });
  if (!record) throw new Error('Invalid OTP');
  if (record.expiryTime < new Date()) {
    await CustomerOTP.updateOne({ _id: record._id }, { status: 'Expired' });
    throw new Error('OTP expired');
  }
  await CustomerOTP.deleteMany({ phone });

  // Upsert customer — first login creates the record
  let customer = await Customer.findOne({ phone });
  const isNewUser = !customer;
  if (!customer) customer = await Customer.create({ phone });

  const token = signToken(customer._id);
  const refreshToken = signRefreshToken(customer._id);
  return { customer, token, refreshToken, isNewUser };
};

const signToken = (customerId) =>
  jwt.sign({ customerId: customerId.toString() }, process.env.CUSTOMER_JWT_SECRET, {
    expiresIn: '7d',
  });

const signRefreshToken = (customerId) =>
  jwt.sign({ customerId: customerId.toString() }, process.env.CUSTOMER_JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  });

const refreshCustomerToken = async (refreshToken) => {
  const decoded = jwt.verify(refreshToken, process.env.CUSTOMER_JWT_REFRESH_SECRET);
  const customer = await Customer.findById(decoded.customerId);
  if (!customer) throw new Error('Customer not found');
  return { token: signToken(customer._id) };
};

module.exports = {
  initiateCustomerOTP,
  verifyCustomerOTP,
  refreshCustomerToken,
  signToken,
};
