// models/Customer.js
// New model for customer-facing app. Separate from Gardener model.
// Admin portal reads this collection in read-only view.

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const addressSchema = new Schema({
  label: { type: String, enum: ['home', 'office', 'other'], default: 'home' },
  line1: { type: String, required: true },
  line2: { type: String },
  city: { type: String, required: true },
  pincode: { type: String, required: true },
  state: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const customerSchema = new Schema({
  firebaseUID: { type: String, sparse: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  profilePhoto: { type: String, default: '' },        // Cloudinary URL
  walletBalance: { type: Number, default: 0 },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: Types.ObjectId, ref: 'Customer', default: null },
  addresses: { type: [addressSchema], default: [] },  // max 5 enforced in route
}, { timestamps: true });

// Generate a short referral code before first save
customerSchema.pre('save', function (next) {
  if (!this.referralCode) {
    this.referralCode = this.phone.slice(-4) +
      Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
