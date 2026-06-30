const Customer = require('../models/Customer');
const { getNumberConfig } = require('./runtimeConfigService');

async function referralRewardInr() {
  return getNumberConfig('referral.reward.inr', 100);
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

async function applyReferralCodeAtSignup({ customerId, referralCode }) {
  const code = normalizeCode(referralCode);
  if (!code) return { applied: false, reason: 'missing_code' };

  const customer = await Customer.findById(customerId).select('_id referralCode referredBy');
  if (!customer) return { applied: false, reason: 'customer_not_found' };
  if (customer.referredBy) return { applied: false, reason: 'already_referred' };

  const referrer = await Customer.findOne({ referralCode: code }).select('_id');
  if (!referrer) return { applied: false, reason: 'invalid_code' };
  if (String(referrer._id) === String(customer._id)) return { applied: false, reason: 'self_referral' };

  await Customer.updateOne(
    { _id: customer._id, referredBy: null },
    { $set: { referredBy: referrer._id, referredAt: new Date(), modifyOn: new Date() } },
  );
  return { applied: true, referrerId: referrer._id };
}

async function rewardReferralOnFirstCompletion({ customerId }) {
  const reward = await referralRewardInr();
  const customer = await Customer.findById(customerId).select('_id referredBy referralRewardGrantedAt');
  if (!customer) return { rewarded: false, reason: 'customer_not_found' };
  if (!customer.referredBy) return { rewarded: false, reason: 'no_referrer' };
  if (customer.referralRewardGrantedAt) return { rewarded: false, reason: 'already_rewarded' };

  const referrer = await Customer.findById(customer.referredBy).select('_id');
  if (!referrer) return { rewarded: false, reason: 'referrer_not_found' };

  const now = new Date();
  const result = await Customer.updateOne(
    { _id: customer._id, referralRewardGrantedAt: null },
    {
      $inc: { walletBalance: reward },
      $set: { referralRewardGrantedAt: now, modifyOn: now },
    },
  );

  if (!result.modifiedCount) return { rewarded: false, reason: 'already_rewarded' };

  await Customer.updateOne(
    { _id: referrer._id },
    { $inc: { walletBalance: reward }, $set: { modifyOn: now } },
  );

  return { rewarded: true, amount: reward };
}

module.exports = {
  applyReferralCodeAtSignup,
  rewardReferralOnFirstCompletion,
  referralRewardInr,
};
