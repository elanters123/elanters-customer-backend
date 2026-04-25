// models/CustomerCart.js
// Server-side cart — synced across iOS, Android, Web.
// updatedAt is used by the abandoned-cart cron job.

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const cartItemSchema = new Schema({
  productId:   { type: Types.ObjectId, ref: 'Item', required: true },
  variantLabel:{ type: String, default: '' },          // e.g. "5kg", "10kg"
  quantity:    { type: Number, required: true, min: 1 },
  priceAtAdd:  { type: Number, required: true },       // snapshot price at time of add
}, { _id: false });

const customerCartSchema = new Schema({
  customerId:  { type: Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
  items:       { type: [cartItemSchema], default: [] },
  couponCode:  { type: String, default: null },
  couponDiscount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CustomerCart', customerCartSchema);
