// Dedupes plant-order push events per order + kind.
const mongoose = require('mongoose');
const { Types } = mongoose;

const ORDER_PUSH_KINDS = [
  'confirmed',
  'shipped',
  'completed',
  'canceled',
];

const orderPushReceiptSchema = new mongoose.Schema(
  {
    orderId: { type: Types.ObjectId, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ORDER_PUSH_KINDS,
    },
  },
  { timestamps: true }
);

orderPushReceiptSchema.index({ orderId: 1, kind: 1 }, { unique: true });

const OrderPushReceipt = mongoose.model('OrderPushReceipt', orderPushReceiptSchema);

module.exports = OrderPushReceipt;
module.exports.ORDER_PUSH_KINDS = ORDER_PUSH_KINDS;
