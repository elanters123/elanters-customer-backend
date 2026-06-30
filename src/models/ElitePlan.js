const mongoose = require('mongoose');
const { Schema } = mongoose;

const faqItemSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const elitePlanSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, default: 'default' },
    isActive: { type: Boolean, default: true, index: true },
    title: { type: String, default: 'Elite Membership' },
    headline: { type: String, required: true },
    subtitle: { type: String, default: '' },
    description: { type: String, required: true },
    benefits: { type: [String], default: [] },
    mrp: { type: Number, required: true, min: 1 },
    salePrice: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    durationMonths: { type: Number, required: true, min: 1 },
    durationLabel: { type: String, required: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    couponCodePrefix: { type: String, required: true, uppercase: true, trim: true },
    couponName: { type: String, default: 'Elite member discount' },
    couponDescription: { type: String, default: '' },
    checkoutDescription: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    bannerLines: { type: [String], default: [] },
    faq: { type: [faqItemSchema], default: [] },
    howItWorks: { type: [String], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ElitePlan', elitePlanSchema);
