const mongoose = require('mongoose');
const { Schema } = mongoose;

const runtimeConfigSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    numberValue: { type: Number, default: null },
    stringValue: { type: String, default: null, trim: true },
    booleanValue: { type: Boolean, default: null },
  },
  { timestamps: true },
);

runtimeConfigSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('RuntimeConfig', runtimeConfigSchema);
