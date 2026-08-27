const router = require('express').Router();
const auth = require('../../middleware/auth');
const { getOrders, getOrderById, createOrder, cancelOrder, confirmPayment } = require('../../controllers/mobile/orderController');

router.get('/', auth, getOrders);
router.post('/confirm-payment', auth, confirmPayment);
router.get('/:id', auth, getOrderById);
router.patch('/:id/cancel', auth, cancelOrder);
router.post('/', auth, createOrder);

module.exports = router;
