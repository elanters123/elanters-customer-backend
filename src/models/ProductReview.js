const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'customer',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    images: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

productReviewSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('ProductReview', productReviewSchema);
