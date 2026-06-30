const {
  getActiveCouponsForCustomer,
} = require('../../services/couponService');

const getActiveCoupons = async (req, res) => {
  try {
    const coupons = await getActiveCouponsForCustomer(req.customerId);
    res.json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getActiveCoupons };
