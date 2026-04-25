// middleware/secretToken.js
// Validates the shared secret-token header on all API requests.
// Clients must send: secret-token: Bearer <SECRET_TOKEN_KEY>

const secretTokenMiddleware = (req, res, next) => {
  try {
    const tokenHeader = req.headers['secret-token'];
    if (!tokenHeader || !tokenHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorised client' });
    }

    const token = tokenHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token malformed' });
    }

    if (token !== process.env.SECRET_TOKEN_KEY) {
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid token' });
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = secretTokenMiddleware;
