const mongoose = require('mongoose');

// Minimal Gardener model registration for populate('assignee.gardenerRef').
// Uses the same model name as admin backend: "Gardener".
const gardenerSchema = new mongoose.Schema(
  {
    name: { type: String },
    phone: { type: String },
  },
  { strict: false }
);

const Gardener = mongoose.models.Gardener || mongoose.model('Gardener', gardenerSchema);

module.exports = Gardener;
