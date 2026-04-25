// models/CustomerPushToken.js
// FCM device tokens per customer — used by push notification service.
// One record per device. Replaced on token refresh.

const mongoose = require('mongoose');
const { Types } = mongoose;

const pushTokenSchema = new mongoose.Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
  token:      { type: String, required: true, unique: true },
  platform:   { type: String, enum: ['ios', 'android', 'web'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('CustomerPushToken', pushTokenSchema);
