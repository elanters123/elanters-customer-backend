const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  getProfile, updateProfile,
  getAddresses, addAddress, updateAddress, deleteAddress,
} = require('../../controllers/web/profileController');

router.get('/', auth, getProfile);
router.patch('/', auth, updateProfile);
router.get('/addresses', auth, getAddresses);
router.post('/addresses', auth, addAddress);
router.patch('/addresses/:addressId', auth, updateAddress);
router.delete('/addresses/:addressId', auth, deleteAddress);

module.exports = router;
