// middleware/secretToken.js
// Validates the shared secret-token header on all API requests.
// Clients must send: secret-token: Bearer <SECRET_TOKEN_KEY>

const logger = require('../utils/logger');

function requestMeta(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.headers['x-forwarded-for'] || null,
  };
}

const secretTokenMiddleware = (req, res, next) => {
  try {
    const configured = Boolean(process.env.SECRET_TOKEN_KEY);
    const configuredLen = (process.env.SECRET_TOKEN_KEY || '').length;
    const tokenHeader = req.headers['secret-token'];

    if (!tokenHeader || !tokenHeader.startsWith('Bearer ')) {
      logger.warn('Secret token rejected', 'Auth', {
        ...requestMeta(req),
        reason: 'missing_or_malformed_header',
        status: 401,
        secretConfigured: configured,
        secretLen: configuredLen,
      });
      return res.status(401).json({ success: false, message: 'Unauthorised client' });
    }

    const token = tokenHeader.split(' ')[1];
    if (!token) {
      logger.warn('Secret token rejected', 'Auth', {
        ...requestMeta(req),
        reason: 'empty_bearer_token',
        status: 401,
        secretConfigured: configured,
        secretLen: configuredLen,
      });
      return res.status(401).json({ success: false, message: 'Token malformed' });
    }

    if (!configured) {
      logger.error('SECRET_TOKEN_KEY is not set on server', 'Auth', {
        ...requestMeta(req),
        status: 403,
      });
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid token' });
    }

    if (token !== process.env.SECRET_TOKEN_KEY) {
      logger.warn('Secret token rejected', 'Auth', {
        ...requestMeta(req),
        reason: 'token_mismatch',
        status: 403,
        // lengths only — never log the secret itself
        clientTokenLen: token.length,
        serverSecretLen: configuredLen,
      });
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid token' });
    }

    next();
  } catch (error) {
    logger.error('Secret token middleware error', 'Auth', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = secretTokenMiddleware;
