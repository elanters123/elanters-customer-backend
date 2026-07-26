// models/ProductImage.js
// Shared product media stored once in MongoDB; items reference via imageIds.

const mongoose = require('mongoose');

const productImageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true, trim: true },
    baseName: { type: String, index: true, trim: true },
    contentType: { type: String, required: true },
    byteSize: { type: Number },
    sha256: { type: String, index: true },
    data: { type: Buffer, required: true },
    sourcePath: { type: String },
  },
  { timestamps: true, collection: 'product_images' }
);

module.exports = mongoose.model('ProductImage', productImageSchema);
