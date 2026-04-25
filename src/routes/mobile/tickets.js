const router = require('express').Router();
const auth = require('../../middleware/auth');
const { createTicket, getTicketsByOrder } = require('../../controllers/mobile/ticketController');

router.post('/', auth, createTicket);
router.get('/order/:orderId', auth, getTicketsByOrder);

module.exports = router;
