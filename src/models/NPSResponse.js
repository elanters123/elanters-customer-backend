// models/NPSResponse.js
const mongoose = require('mongoose');
const { Types } = mongoose;

const npsSchema = new mongoose.Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer', required: true, index: true },
  orderId:    { type: Types.ObjectId, ref: 'CustomerOrder', default: null },
  bookingId:  { type: Types.ObjectId, ref: 'Booking', default: null },
  score:      { type: Number, required: true, min: 1, max: 10 },
  comment:    { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('NPSResponse', npsSchema);
