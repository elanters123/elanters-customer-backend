const router = require('express').Router();
const auth = require('../../middleware/auth');
const { purchase, initPayment, confirmPayment } = require('../../controllers/mobile/eliteController');

router.post('/purchase', auth, purchase);
router.post('/init-payment', auth, initPayment);
router.post('/confirm-payment', auth, confirmPayment);

module.exports = router;
