const { assignCouponToCustomer } = require('../../services/couponService');

/** Ops/admin: assign a customer_specific coupon to a customer (secret-token protected route). */
const assignCoupon = async (req, res) => {
  try {
    const { customerId, couponCode } = req.body;
    if (!customerId || !couponCode) {
      return res.status(400).json({
        success: false,
        message: 'customerId and couponCode are required',
      });
    }

    const result = await assignCouponToCustomer({ customerId, couponCode });
    res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      reactivated: result.reactivated ?? false,
      assignmentId: result.assignment._id,
      couponCode: result.coupon.code,
      customerId: String(result.assignment.customerId),
    });
  } catch (error) {
    const status = /not found|inactive|only customer_specific/i.test(error.message) ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = { assignCoupon };
