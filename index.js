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

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Web gets strict origin; mobile sends no Origin header so we allow * for /mobile
app.use('/api/web', cors({
  credentials: true,
  origin: process.env.WEB_CLIENT_URL || 'http://localhost:3000',
}));
app.use('/api/mobile', cors({ origin: '*' }));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

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
app.use('/api/web/auth',     secretTokenMiddleware, require('./src/routes/web/auth'));
app.use('/api/web/profile',  secretTokenMiddleware, require('./src/routes/web/profile'));
app.use('/api/web/bookings', secretTokenMiddleware, require('./src/routes/web/bookings'));
app.use('/api/web/orders',   secretTokenMiddleware, require('./src/routes/web/orders'));
app.use('/api/web/cart',     secretTokenMiddleware, require('./src/routes/web/cart'));
app.use('/api/web/catalog',  secretTokenMiddleware, require('./src/routes/web/catalog'));
app.use('/api/web/tickets',  secretTokenMiddleware, require('./src/routes/web/tickets'));

// ─── Mobile Routes ────────────────────────────────────────────────────────────
app.use('/api/mobile/auth',     secretTokenMiddleware, require('./src/routes/mobile/auth'));
app.use('/api/mobile/profile',  secretTokenMiddleware, require('./src/routes/mobile/profile'));
app.use('/api/mobile/bookings', secretTokenMiddleware, require('./src/routes/mobile/bookings'));
app.use('/api/mobile/orders',   secretTokenMiddleware, require('./src/routes/mobile/orders'));
app.use('/api/mobile/cart',     secretTokenMiddleware, require('./src/routes/mobile/cart'));
app.use('/api/mobile/catalog',  secretTokenMiddleware, require('./src/routes/mobile/catalog'));
app.use('/api/mobile/tickets',  secretTokenMiddleware, require('./src/routes/mobile/tickets'));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'customer-service' }));

app.listen(PORT, () => logger.success(`customer-service running on port ${PORT}`, 'Server'));
