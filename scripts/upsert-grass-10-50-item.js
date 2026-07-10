/**
 * Upsert Gardener catalog Item: Grass Cutting/Cleaning (10-50)Sqft @ ₹1,000
 * Run from elanters-backend: node scripts/upsert-grass-10-50-item.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../src/models/Item');

const PRODUCT_ID = process.env.GARDENER_SKU_GRASS_10_50 || '6936b3a7b24bb1fdff979734';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Set MONGODB_URI (or MONGO_URI) in .env');
  }

  await mongoose.connect(uri);

  const _id = new mongoose.Types.ObjectId(PRODUCT_ID);
  const doc = {
    name: 'Grass Cutting/Cleaning (10-50)Sqft',
    price: 1000,
    unit: 'unit',
    category: 'Gardener',
    careInstruction: [],
    longDescription:
      'Grass cutting, deweeding and cleaning for a 10–50 sq.ft lawn area. Billable add-on for villa gardener visits.',
    shortDescription: 'Grass cutting / cleaning — 10–50 sq.ft',
    offer: 0,
    stock: 9999,
    images: [],
  };

  const result = await Item.updateOne({ _id }, { $set: doc }, { upsert: true });
  console.log(
    `Upserted Grass Cutting/Cleaning (10-50)Sqft (${PRODUCT_ID}) — matched: ${result.matchedCount}, modified: ${result.modifiedCount}, upserted: ${result.upsertedCount}`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
