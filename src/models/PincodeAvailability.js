// models/PincodeAvailability.js
const mongoose = require('mongoose');

const pincodeSchema = new mongoose.Schema({
  pincode:          { type: String, required: true, unique: true, index: true },
  city:             { type: String, required: true },
  state:            { type: String, required: true },
  servicesAvailable:{ type: [String], default: ['flat', 'villa', 'grass'] },
  active:           { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('PincodeAvailability', pincodeSchema);
