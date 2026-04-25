// const mongoose = require('mongoose');

// const notificationSchema = new mongoose.Schema({
//   date: {
//     type: Date,
//     default: Date.now
//   },
//   textEnglish: {
//     type: String,
//     required: true
//   },
//   textHindi: {
//     type: String,
//     required: true
//   },
//   readers: [
//     {
//       gardenerId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Gardener',
//         required: true
//       },
//       hasRead: {
//         type: Boolean,
//         default: false
//       }
//     }
//   ],
//   notificationTypes: [
//     {
//       type: String,
//       enum: ['order', 'payment', 'system', 'update', 'other', 'report', 'message', 'subscription'] // extend as needed
//     }
//   ],
//   isImportant: {
//     type: Boolean,
//     default: false
//   },
//   actionURL: String,
//   relatedOrderId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Order'
//   },
//   isGlobal: {
//     type: Boolean,
//     default: false
//   }
// });

// module.exports = mongoose.model('Notification', notificationSchema);
const mongoose =require("mongoose");
const notificationSchema=new mongoose.Schema({
  orderId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  gardenerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gardener',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  textEnglish: {
    type: String,
    required: true
  },
  textHindi: {
    type: String,
    required: true
  },
  actionUrl:{
    type:String
  }
})

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;