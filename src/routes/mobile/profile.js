const router = require('express').Router();
const auth = require('../../middleware/auth');
const {
  getProfile, updateProfile, registerPushToken,
  getAddresses, addAddress, deleteAddress,
} = require('../../controllers/mobile/profileController');

router.get('/', auth, getProfile);
router.patch('/', auth, updateProfile);
router.post('/push-token', auth, registerPushToken);
router.get('/addresses', auth, getAddresses);
router.post('/addresses', auth, addAddress);
router.delete('/addresses/:addressId', auth, deleteAddress);

module.exports = router;
