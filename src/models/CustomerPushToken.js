// models/CustomerPushToken.js
// Expo push tokens per customer (ExponentPushToken[...]) — used by pushNotificationService.
// One record per device. Upserted on register / refresh.

const mongoose = require('mongoose');
const { Types } = mongoose;

const pushTokenSchema = new mongoose.Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
  token:      { type: String, required: true, unique: true },
  platform:   { type: String, enum: ['ios', 'android', 'web'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('CustomerPushToken', pushTokenSchema);
