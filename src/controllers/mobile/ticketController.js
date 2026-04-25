// controllers/web/ticketController.js
const ticketService = require('../../services/ticketService');

const createTicket = async (req, res) => {
  try {
    const { orderId, issueDescription } = req.body;
    if (!orderId || !issueDescription)
      return res.status(400).json({ success: false, message: 'orderId and issueDescription are required' });

    const ticket = await ticketService.createTicket({ orderId, issueDescription });
    res.status(201).json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTicketsByOrder = async (req, res) => {
  try {
    const tickets = await ticketService.getTicketsByOrderId(req.params.orderId);
    res.json({ success: true, tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createTicket, getTicketsByOrder };
