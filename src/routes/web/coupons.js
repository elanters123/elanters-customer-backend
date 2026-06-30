const router = require('express').Router();
const { assignCoupon } = require('../../controllers/web/couponController');

router.post('/assign', assignCoupon);

module.exports = router;
