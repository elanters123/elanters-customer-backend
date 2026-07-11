// Dedupes booking push events (admin + customer API + change stream).
const mongoose = require('mongoose');
const { Types } = mongoose;

const bookingPushReceiptSchema = new mongoose.Schema(
  {
    bookingId: { type: Types.ObjectId, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ['confirmed', 'assigned', 'completed', 'canceled'],
    },
  },
  { timestamps: true }
);

bookingPushReceiptSchema.index({ bookingId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('BookingPushReceipt', bookingPushReceiptSchema);
