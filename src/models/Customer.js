// models/Customer.js
// New model for customer-facing app. Separate from Gardener model.
// Admin portal reads this collection in read-only view.

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const addressSchema = new Schema({
  label: { type: String, enum: ['home', 'office', 'other'], default: 'home' },
  line1: { type: String, required: true, trim: true, maxlength: 255 },
  line2: { type: String, trim: true, maxlength: 255 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  pincode: { type: String, required: true, trim: true, maxlength: 10 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const customerSchema = new Schema({
  firebaseUID: { type: String, sparse: true, index: true },

  // Enhanced fields based on previous model
  phoneNumber: {
    type: String,
    trim: true,
    minlength: [10, 'Phone number must be at least 10 digits'],
    maxlength: [15, 'Phone number cannot exceed 15 digits'],
  },
  name: {
    type: String,
    default: '',
    trim: true,
    maxlength: [255, 'Name cannot exceed 255 characters'],
  },
  address: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true, maxlength: [100, 'City cannot exceed 100 characters'] },
  state: { type: String, default: '', trim: true, maxlength: [100, 'State cannot exceed 100 characters'] },
  emailId: { type: String, default: '', lowercase: true, trim: true, maxlength: [200, 'Email cannot exceed 200 characters'] },
  coordinates: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  pincode: { type: String, default: '', trim: true, maxlength: [10, 'Pincode cannot exceed 10 characters'] },
  createdOn: { type: Date, default: Date.now },
  modifyOn: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  accountStatus: {
    type: String,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active',
  },

  profilePhoto: { type: String, default: '' },        // Cloudinary URL
  walletBalance: { type: Number, default: 0 },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: Types.ObjectId, ref: 'Customer', default: null },
  addresses: { type: [addressSchema], default: [] },  // max 5 enforced in route
}, { timestamps: true });

customerSchema.pre('save', function (next) {
  if (!this.phoneNumber) this.phoneNumber = '';
  if (!this.emailId) this.emailId = '';

  // Update modifyOn only when document is changed and not new (old-model behavior)
  if (this.isModified() && !this.isNew) {
    this.modifyOn = Date.now();
  }

  if (!this.referralCode) {
    this.referralCode = this.phoneNumber.slice(-4) +
      Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
