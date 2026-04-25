const router = require('express').Router();
const auth = require('../../middleware/auth');
const { getCart, addToCart, updateCartItem, clearCart } = require('../../controllers/mobile/cartController');

router.get('/', auth, getCart);
router.post('/items', auth, addToCart);
router.patch('/items', auth, updateCartItem);
router.delete('/', auth, clearCart);

module.exports = router;
