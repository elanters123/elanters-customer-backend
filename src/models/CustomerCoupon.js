// models/CustomerCoupon.js
// Per-customer coupon assignment (customer-specific coupons + optional pinned offers).

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const customerCouponSchema = new Schema(
  {
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
    couponId: { type: Types.ObjectId, ref: 'Coupon', required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'used', 'revoked', 'expired'],
      default: 'active',
      index: true,
    },
    assignedAt: { type: Date, default: Date.now },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

customerCouponSchema.index({ customerId: 1, couponId: 1 }, { unique: true });
customerCouponSchema.index({ customerId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('CustomerCoupon', customerCouponSchema);
