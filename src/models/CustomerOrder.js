// models/CustomerOrder.js
// Plant/product orders placed by customers via the app.
// Separate from gardener Bookings collection.

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const orderItemSchema = new Schema({
  productId:    { type: Types.ObjectId, ref: 'Item', required: true },
  name:         { type: String, required: true },
  image:        { type: String, default: '' },
  quantity:     { type: Number, required: true, min: 1 },
  price:        { type: Number, required: true },
  variantLabel: { type: String, default: '' },
}, { _id: false });

const addressSnapshotSchema = new Schema({
  label: String, line1: String, line2: String,
  city: String, pincode: String, state: String,
}, { _id: false });

const customerOrderSchema = new Schema({
  customerId:      { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
  items:           { type: [orderItemSchema], required: true },
  deliveryAddress: { type: addressSnapshotSchema, required: true },
  subtotal:        { type: Number, required: true },
  discount:        { type: Number, default: 0 },
  deliveryFee:     { type: Number, default: 0 },
  total:           { type: Number, required: true },
  couponCode:      { type: String, default: null },
  walletCreditsUsed: { type: Number, default: 0 },
  paymentMethod:   {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet', 'cod'],
    required: true,
  },
  paymentStatus:   {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  razorpayOrderId:   { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  razorpaySignature: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },
}, { timestamps: true });

// Compound index for paginated order history queries
customerOrderSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerOrder', customerOrderSchema);
