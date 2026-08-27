/**
 * Seed Home Gardener (flat) ProductReview docs with curated testimonials.
 * Run from elanters-backend when Atlas IP is whitelisted:
 *   node scripts/seedHomeGardenerReviews.js
 *
 * Replaces existing reviews for the flat review product id.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCT_ID = '6936b3a7b24bb1fdff97971a'; // GARDENER_SERVICE_REVIEW_PRODUCT_IDS.flat
const CUSTOMER_ID = new mongoose.Types.ObjectId();

const REVIEWS = [
  ['Mohan Krishna', '2026-08-16T15:45:00.000Z', 'Five-star service. Professional, efficient, and highly recommended for home gardening.'],
  ['Anjali Saxena', '2026-08-15T09:05:00.000Z', 'Wonderful experience. The garden has never looked so beautiful.'],
  ['Pradeep Nair', '2026-08-14T14:25:00.000Z', 'Very experienced gardener with excellent knowledge of plants.'],
  ['Rajesh Chauhan', '2026-08-13T11:50:00.000Z', 'Fantastic gardening service. Everything was done perfectly.'],
  ['Aishwarya Raman', '2026-08-12T16:05:00.000Z', 'Very happy with the overall service. Great attention to detail.'],
  ['Kiran Joshi', '2026-08-11T10:35:00.000Z', 'Professional and reliable. The garden now looks stunning.'],
  ['Madhavan Nair', '2026-08-10T15:55:00.000Z', 'Excellent quality service. Highly recommend for home gardening.'],
  ['Vivek Patel', '2026-08-09T13:15:00.000Z', 'Amazing work. Very friendly and hardworking gardener.'],
  ['Shreya Pillai', '2026-08-08T09:40:00.000Z', 'The plants were trimmed beautifully and the garden was spotless.'],
  ['Ritu Sharma', '2026-08-07T17:25:00.000Z', 'Outstanding garden care. Everything was completed on time.'],
  ['Vignesh Subramanian', '2026-08-06T10:00:00.000Z', 'Excellent experience from start to finish. Truly professional.'],
  ['Sandeep Kumar', '2026-08-05T14:35:00.000Z', 'Very dependable service. My garden looks fresh and healthy.'],
  ['Keerthana Balan', '2026-08-04T11:15:00.000Z', 'The gardener was polite, experienced, and completed everything perfectly.'],
  ['Nisha Singh', '2026-08-03T16:50:00.000Z', 'Quick service and excellent results. Highly recommended.'],
  ['Raghavendra Rao', '2026-08-02T12:20:00.000Z', 'Excellent maintenance and landscaping. The garden looks beautiful.'],
  ['Sunita Verma', '2026-08-01T09:55:00.000Z', 'Highly satisfied with the quality of work. Very professional team.'],
  ['Bhavya Ramesh', '2026-07-31T15:30:00.000Z', 'Amazing service. Every corner of the garden was cleaned perfectly.'],
  ['Ankit Mishra', '2026-07-30T10:40:00.000Z', 'Great value for money. Clean, efficient, and reliable gardener.'],
  ['Sai Prasad', '2026-07-29T16:15:00.000Z', 'Excellent work. The flowers and plants are thriving after the service.'],
  ['Sneha Jain', '2026-07-28T13:50:00.000Z', 'Very professional and punctual. The results were beyond expectations.'],
  ['Karthik Rajan', '2026-07-27T09:45:00.000Z', 'Outstanding gardening service. Will definitely recommend to friends.'],
  ['Ashish Gupta', '2026-07-26T17:05:00.000Z', 'Excellent garden cleanup. Everything was neat and beautifully maintained.'],
  ['Divya Nair', '2026-07-25T10:20:00.000Z', 'Very courteous and skilled. Highly impressed with the quality of work.'],
  ['Pooja Sharma', '2026-07-24T14:55:00.000Z', 'Fantastic job. My lawn and plants have never looked better.'],
  ['Naveen Kumar', '2026-07-23T11:25:00.000Z', 'Very knowledgeable gardener. Everything was completed efficiently.'],
  ['Manoj Kumar', '2026-07-22T16:30:00.000Z', 'Excellent service with great attention to detail. Highly satisfied.'],
  ['Harini Srinivasan', '2026-07-21T09:10:00.000Z', 'Amazing transformation. The plants are healthier and the garden looks fantastic.'],
  ['Vikas Mishra', '2026-07-20T15:40:00.000Z', 'Very professional and reliable. The landscaping work exceeded expectations.'],
  ['Ananya Menon', '2026-07-19T10:15:00.000Z', 'Wonderful experience. The garden was cleaned and maintained perfectly.'],
  ['Deepak Yadav', '2026-07-18T13:35:00.000Z', 'Highly recommended. Friendly staff and excellent quality work.'],
  ['Meera Krishnan', '2026-07-17T08:50:00.000Z', 'Outstanding service. Great attention to detail and excellent plant care.'],
  ['Neha Gupta', '2026-07-16T17:20:00.000Z', 'Very happy with the results. My outdoor space looks vibrant and neat.'],
  ['Suresh Kumar', '2026-07-15T11:55:00.000Z', 'Very experienced gardener. Clean work and completed everything on time.'],
  ['Rohit Tiwari', '2026-07-14T14:10:00.000Z', 'Excellent maintenance work. The garden has never looked this beautiful.'],
  ['Kavya Iyer', '2026-07-13T09:30:00.000Z', 'Fantastic gardening service. Every plant was handled with care and attention.'],
  ['Amit Singh', '2026-07-12T16:45:00.000Z', 'The lawn and flower beds look amazing. Very hardworking and polite.'],
  ['Lakshmi Nair', '2026-07-11T10:05:00.000Z', 'Professional gardener with excellent knowledge of plants. Highly satisfied with the service.'],
  ['Arjun Reddy', '2026-07-10T15:20:00.000Z', 'Great work! My garden looks fresh, healthy, and well maintained. Will definitely book again.'],
  ['Priya Verma', '2026-07-09T11:40:00.000Z', 'Very satisfied with the gardening service. Everything was cleaned, trimmed, and maintained perfectly.'],
  ['Rahul Sharma', '2026-07-08T09:15:00.000Z', 'Excellent gardening service. The gardener was professional, punctual, and transformed my home garden beautifully. Highly recommended!'],
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.db.collection('productreviews');
  const productId = new mongoose.Types.ObjectId(PRODUCT_ID);

  const del = await col.deleteMany({ productId });
  console.log('Deleted existing:', del.deletedCount);

  const docs = REVIEWS.map(([customerName, createdAt, text]) => ({
    productId,
    customerId: CUSTOMER_ID,
    customerName,
    rating: 5,
    text,
    images: [],
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  }));

  const ins = await col.insertMany(docs);
  console.log('Inserted:', Object.keys(ins.insertedIds).length);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
