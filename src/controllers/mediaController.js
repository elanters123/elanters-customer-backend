// controllers/mediaController.js
// Public product image streaming (no secret-token — used by <img> / expo-image).

const ProductImage = require('../models/ProductImage');
const mongoose = require('mongoose');

const getProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid image id' });
    }

    const doc = await ProductImage.findById(id).select('data contentType filename byteSize');
    if (!doc || !doc.data) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const buf = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer || doc.data);
    res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    if (doc.filename) {
      res.setHeader('Content-Disposition', `inline; filename="${doc.filename.replace(/"/g, '')}"`);
    }
    return res.send(buf);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProductImage };
