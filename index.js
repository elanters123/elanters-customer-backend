const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const logger = require('./src/utils/logger');
const secretTokenMiddleware = require('./src/middleware/secretToken');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3050;

// ─── Service prefix ───────────────────────────────────────────────────────────
// All routes are mounted under /<SERVICE_PREFIX>/api/...
// Default: "customer" → /customer/api/mobile/... /customer/api/web/...
const SERVICE_PREFIX = (process.env.SERVICE_PREFIX || 'customer').replace(/^\/|\/$/g, '');
const BASE = `/${SERVICE_PREFIX}/api`;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Web gets strict origin; mobile sends no Origin header so we allow * for /mobile
app.use(`${BASE}/web`, cors({
  credentials: true,
  origin: process.env.WEB_CLIENT_URL || 'http://localhost:3000',
}));
app.use(`${BASE}/mobile`, cors({ origin: '*' }));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// ─── Service identifier header (on every response) ────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Service', 'elanters-customer-backend');
  res.setHeader('X-Service-Port', PORT);
  next();
});

// ─── Database ─────────────────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    logger.info('Connecting to MongoDB...', 'Database');
    await mongoose.connect(process.env.MONGO_URI);
    logger.success('MongoDB connected', 'Database');
  } catch (error) {
    logger.error('MongoDB connection failed', 'Database', error);
    process.exit(1);
  }
};
connectDB();

// ─── Web Routes ───────────────────────────────────────────────────────────────
app.use(`${BASE}/web/auth`,     secretTokenMiddleware, require('./src/routes/web/auth'));
app.use(`${BASE}/web/profile`,  secretTokenMiddleware, require('./src/routes/web/profile'));
app.use(`${BASE}/web/bookings`, secretTokenMiddleware, require('./src/routes/web/bookings'));
app.use(`${BASE}/web/orders`,   secretTokenMiddleware, require('./src/routes/web/orders'));
app.use(`${BASE}/web/cart`,     secretTokenMiddleware, require('./src/routes/web/cart'));
app.use(`${BASE}/web/catalog`,  secretTokenMiddleware, require('./src/routes/web/catalog'));
app.use(`${BASE}/web/tickets`,  secretTokenMiddleware, require('./src/routes/web/tickets'));

// ─── Mobile Routes ────────────────────────────────────────────────────────────
app.use(`${BASE}/mobile/auth`,     secretTokenMiddleware, require('./src/routes/mobile/auth'));
app.use(`${BASE}/mobile/profile`,  secretTokenMiddleware, require('./src/routes/mobile/profile'));
app.use(`${BASE}/mobile/bookings`, secretTokenMiddleware, require('./src/routes/mobile/bookings'));
app.use(`${BASE}/mobile/orders`,   secretTokenMiddleware, require('./src/routes/mobile/orders'));
app.use(`${BASE}/mobile/cart`,     secretTokenMiddleware, require('./src/routes/mobile/cart'));
app.use(`${BASE}/mobile/catalog`,  secretTokenMiddleware, require('./src/routes/mobile/catalog'));
app.use(`${BASE}/mobile/tickets`,  secretTokenMiddleware, require('./src/routes/mobile/tickets'));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'elanters-customer-backend',
  prefix: BASE,
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  uptime: `${Math.floor(process.uptime())}s`,
  timestamp: new Date().toISOString(),
}));

app.listen(PORT, () => {
  logger.success(`elanters-customer-backend running on port ${PORT}`, 'Server');
  logger.info(`API prefix: ${BASE}`, 'Server');
  logger.info(`Example: POST ${BASE}/mobile/auth/send-otp`, 'Server');
});
