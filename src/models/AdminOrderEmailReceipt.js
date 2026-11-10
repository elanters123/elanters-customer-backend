// Dedupes admin "new order" emails so the same Booking is mailed once.
const mongoose = require('mongoose');
const { Types } = mongoose;

const adminOrderEmailReceiptSchema = new mongoose.Schema(
  {
    bookingId: { type: Types.ObjectId, required: true, unique: true, index: true },
    eOrderId: { type: String, default: null, trim: true, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AdminOrderEmailReceipt', adminOrderEmailReceiptSchema);
