// middleware/auth.js
// Validates customer JWT. Accepts token from:
//   - Cookie (web): customerToken
//   - Authorization header (mobile): Bearer <token>
// Sets req.customerId on success.

const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const { assertSessionActive } = require('../services/authService');
require('dotenv').config();

const authMiddleware = async (req, res, next) => {
  let token = req.cookies?.customerToken;

  if (!token) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) token = auth.slice(7);
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);
    const customer = await Customer.findById(decoded.customerId).select('sessionVersion accountStatus');
    assertSessionActive(customer, decoded);
    req.customerId = decoded.customerId;
    next();
  } catch (err) {
    const msg =
      err?.message === 'Session ended'
        ? 'Session ended. Please sign in again.'
        : 'Invalid or expired token';
    return res.status(401).json({ success: false, message: msg });
  }
};

module.exports = authMiddleware;
