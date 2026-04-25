const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  getProducts, getProductById, checkPincode,
  getWishlist, toggleWishlist,
} = require('../../controllers/mobile/catalogController');

router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.get('/pincode/:pincode', checkPincode);
router.get('/wishlist', auth, getWishlist);
router.post('/wishlist/toggle', auth, toggleWishlist);

module.exports = router;
