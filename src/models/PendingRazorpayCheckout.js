// models/PendingRazorpayCheckout.js
// Holds checkout payload until Razorpay payment is verified.
// No Booking / CustomerOrder is created until confirm succeeds.

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const pendingRazorpayCheckoutSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['booking', 'order'],
      required: true,
      index: true,
    },
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },
    description: { type: String, default: '' },
    couponCode: { type: String, default: null },
    /** Original client checkout body (booking or plant order). */
    payload: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

pendingRazorpayCheckoutSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingRazorpayCheckout', pendingRazorpayCheckoutSchema);
