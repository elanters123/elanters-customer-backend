// Dedupes order push events (payment confirm may be retried).
const mongoose = require('mongoose');
const { Types } = mongoose;

const orderPushReceiptSchema = new mongoose.Schema(
  {
    orderId: { type: Types.ObjectId, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ['confirmed'],
    },
  },
  { timestamps: true }
);

orderPushReceiptSchema.index({ orderId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('OrderPushReceipt', orderPushReceiptSchema);
