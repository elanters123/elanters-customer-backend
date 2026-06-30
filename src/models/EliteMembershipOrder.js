const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const eliteMembershipOrderSchema = new Schema(
  {
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    paymentMethod: { type: String, enum: ['online'], default: 'online' },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    eliteMemberId: { type: String, default: null },
    eliteCouponCode: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'activated', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

eliteMembershipOrderSchema.index({ customerId: 1, createdAt: -1 });
eliteMembershipOrderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

module.exports = mongoose.model('EliteMembershipOrder', eliteMembershipOrderSchema);
