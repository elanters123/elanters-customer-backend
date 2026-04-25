const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

/**
 * Unified booking schema for all booking statuses
 * Fields will be populated or null based on booking status
 */
const bookingSchema = new Schema({
  // Core booking information (always present)
  serviceType: { 
    type: String, 
    required: true,
    enum: ["gardening", "plantation"]
  },  // Type of service requested
  description: { type: String, required: true },  // Brief description of service

  eOrderId: {
    type: String,
    required: false,
  },
  
  status: {
    type: String,
    required: true,
    enum: ["upcoming", "pending", "completed", "canceled"],
    default: "upcoming"
  },

  // Assignee information

  assignee: {
    type: {
      type: String,
      enum: ["admin", "gardener"],
      default: "admin"
    },
    gardenerRef: {
      type: Types.ObjectId,
      ref: 'Gardener',
      default: null
    },
    assignedAt: Date,
  },

  // Scheduling information (always present)
  scheduledDateTime: {
    date: { type: Date, required: true },
    timeSlot: { 
      type: String,
      required: true,
      enum: ["9am-12pm", "12pm-3pm", "3pm-6pm", "6pm-9pm"]
    }
  },
  
  bookingDate: { type: Date, default: Date.now },

  // Customer information (always present)
  customer: {
    id: { type: Types.ObjectId, ref: 'Customer', },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true }
  },

  // Location details (always present)
  location: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    coordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    }
  },

  // Job details and materials (may be updated after completion)
  materials: [{
    id: { type: Types.ObjectId, ref: 'Item' },
    name: String,
    price: Number,
    quantity: Number,
    unit: String
  }],

  // Payment information (partially filled based on status)
  payment: {
    prePaidAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    totalAmountAfteDiscount: { type: Number, default: 0 },
    companyShare: { type: Number, required: false, default: null },
    gardenerShare: { type: Number, required: false, default: null },
    status: {
      type: String,
      enum: ["pending", "paid", "refunded", "partially_paid", 'failed'],
      default: "pending"
    },
    method: String,
    transactionId: String,
    paymentDate: Date, 
    invoice: {
      id: String,
      url: String,
      generatedAt: Date,
      sentToCustomer: { type: Boolean, default: false }
    },
    qrCodeId: String,
    qrCodeUrl: String,
    qrCodeCreatedAt: Date
  },

  // for discount or coupon code
  coupon: {
    couponRef: {
      type: Types.ObjectId,
      ref: 'Coupon',
      default: null
    },
    code: {
      type: String,
      default: null
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    appliedAt: {
      type: Date,
      default: null
    }
  },
  // Verification details
  verification: {
    status: {
      type: String,
      enum: ["not_verified", "verified"],
      default: "not_verified"
    },
    verifiedAt: Date,
    otpUsed: String
  },

  notes: String,

  // Rating information
  rating: {
    score: Number,
    review: String,
    submittedAt: Date
  },

  // Cancellation information
  cancellation: {
    reason: String,
    canceledBy: {
      type: String,
      enum: ["gardener", "customer", "system"]
    },
    canceledAt: Date,
    refundDetails: {
      amount: Number,
      status: String,
      refundDate: Date
    }
  },

  // Financial tracking
  financialStatus: {
    type: String,
    enum: ["open", "closed"],
    default: "open"
  },

  // Booking history
  history: {
    createdAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    completedAt: Date,
    canceledAt: Date,
    lastModifiedAt: { type: Date, default: Date.now },
    lastModifiedBy: { type: Types.ObjectId, ref: 'User' }
  }
}, {
  timestamps: true
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;