// services/ticketService.js
// Pure business logic — no req/res. Controllers call these functions.
const Ticket = require('../models/ticket');

const generateTicketNumber = () =>
  'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

const createTicket = async ({ orderId, issueDescription }) => {
  const ticket = new Ticket({ ticketNumber: generateTicketNumber(), orderId, issueDescription });
  await ticket.save();
  return ticket;
};

const getTicketsByOrderId = async (orderId) => {
  return Ticket.find({ orderId }).sort({ createdAt: -1 });
};

const updateTicket = async (ticketId, { status, resolutionComment }) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  if (status) ticket.status = status;
  if (resolutionComment) ticket.resolutionComment = resolutionComment;
  await ticket.save();
  return ticket;
};

module.exports = { createTicket, getTicketsByOrderId, updateTicket };
