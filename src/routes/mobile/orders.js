const router = require('express').Router();
const auth = require('../../middleware/auth');
const { getOrders, getOrderById, createOrder, confirmPayment } = require('../../controllers/mobile/orderController');

router.get('/', auth, getOrders);
router.get('/:id', auth, getOrderById);
router.post('/', auth, createOrder);
router.post('/confirm-payment', auth, confirmPayment);

module.exports = router;
