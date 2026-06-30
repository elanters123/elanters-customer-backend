const router = require('express').Router();
const auth = require('../../middleware/auth');
const { getPlan, listPlans, getPlanById, createPlan, updatePlan, purchase, initPayment, confirmPayment } = require('../../controllers/mobile/eliteController');

router.get('/plan', getPlan);
router.get('/plans', listPlans);
router.get('/plan/:id', getPlanById);
router.post('/plan', createPlan);
router.patch('/plan/:id', updatePlan);
router.post('/purchase', auth, purchase);
router.post('/init-payment', auth, initPayment);
router.post('/confirm-payment', auth, confirmPayment);

module.exports = router;
