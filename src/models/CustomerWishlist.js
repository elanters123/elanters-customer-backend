// models/CustomerWishlist.js
const mongoose = require('mongoose');
const { Types } = mongoose;

const wishlistSchema = new mongoose.Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
  productIds: [{ type: Types.ObjectId, ref: 'Item' }],
}, { timestamps: true });

module.exports = mongoose.model('CustomerWishlist', wishlistSchema);
