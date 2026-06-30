const Customer = require('../../models/Customer');
const {
  assertStandaloneEliteBody,
  confirmElitePayment,
  createElitePurchaseIntent,
  isEliteActive,
  ELITE_UPFRONT_PAYMENT_MESSAGE,
} = require('../../services/eliteService');
const { getPublicElitePlan, listElitePlans, getElitePlanById, createElitePlan, updateElitePlan } = require('../../services/elitePlanService');
const { getRazorpayKeyId } = require('../../config/razorpay');

const getPlan = async (_req, res) => {
  try {
    const plan = await getPublicElitePlan();
    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Ops: list all Elite plan versions/configs (secret-token). */
const listPlans = async (_req, res) => {
  try {
    const plans = await listElitePlans();
    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Ops: fetch one plan by Mongo id (secret-token). */
const getPlanById = async (req, res) => {
  try {
    const plan = await getElitePlanById(req.params.id);
    res.json({ success: true, plan });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** Ops: create a new Elite plan config (secret-token). Set isActive:true to make it live. */
const createPlan = async (req, res) => {
  try {
    const plan = await createElitePlan(req.body);
    res.status(201).json({ success: true, plan });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** Ops: update an existing Elite plan (secret-token). */
const updatePlan = async (req, res) => {
  try {
    const plan = await updateElitePlan(req.params.id, req.body);
    res.json({ success: true, plan });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** Direct activation disabled — use init-payment → Razorpay UI → confirm-payment. */
const purchase = async (_req, res) => {
  res.status(400).json({
    success: false,
    message:
      'Use POST /elite/init-payment to create a Razorpay order, complete payment in the app, then POST /elite/confirm-payment.',
  });
};

const initPayment = async (req, res) => {
  try {
    assertStandaloneEliteBody(req.body);
    const { paymentMethod } = req.body;
    if (paymentMethod !== 'online') {
      return res.status(400).json({ success: false, message: ELITE_UPFRONT_PAYMENT_MESSAGE });
    }

    const customer = await Customer.findById(req.customerId).select(
      'name phoneNumber emailId eliteMemberSince eliteMemberExpiresAt',
    );
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    if (isEliteActive(customer)) {
      return res.status(400).json({
        success: false,
        message: 'Elite membership is already active on your account',
        alreadyActive: true,
      });
    }

    const { razorpayOrder, record, plan } = await createElitePurchaseIntent(req.customerId);
    const keyId = getRazorpayKeyId();
    if (!keyId) {
      return res.status(500).json({ success: false, message: 'Razorpay key is not configured' });
    }

    res.status(201).json({
      success: true,
      needsPayment: true,
      eliteOrderId: record._id,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: keyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || 'INR',
      description: plan.checkoutDescription || `Elite Membership (${plan.durationLabel})`,
      planId: String(plan._id),
      prefill: {
        name: customer.name || '',
        email: customer.emailId || '',
        contact: customer.phoneNumber ? `+91${customer.phoneNumber.replace(/\D/g, '').slice(-10)}` : '',
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message,
      alreadyActive: error.alreadyActive ?? false,
    });
  }
};

const confirmPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
      });
    }

    const result = await confirmElitePayment({
      customerId: req.customerId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.json({
      success: true,
      activated: true,
      alreadyActive: result.alreadyActive,
      memberId: result.memberId,
      couponCode: result.couponCode,
      expiresAt: result.expiresAt,
      eliteOrderId: result.order._id,
      discountPercent: result.discountPercent,
      couponCodePrefix: result.couponCodePrefix,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports = { getPlan, listPlans, getPlanById, createPlan, updatePlan, purchase, initPayment, confirmPayment };
