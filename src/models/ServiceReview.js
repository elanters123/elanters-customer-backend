const mongoose = require('mongoose');

const serviceReviewSchema = new mongoose.Schema(
  {
    serviceKey: {
      type: String,
      required: true,
      trim: true,
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

serviceReviewSchema.index({ serviceKey: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceReview', serviceReviewSchema);
