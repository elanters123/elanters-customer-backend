// middleware/auth.js
// Validates customer JWT. Accepts token from:
//   - Cookie (web): customerToken
//   - Authorization header (mobile): Bearer <token>
// Sets req.customerId on success.

const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
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
    req.customerId = decoded.customerId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
