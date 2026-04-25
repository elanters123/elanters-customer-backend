// bookingService.js
const Booking = require("../models/Booking.js");
// Not needed in customer-service (gardener-only models)
// const OTPVerification = require("../models/OTPverification.js");
// const Service = require("../models/Service.js");
// const Gardener = require("../models/gardenerDetails.js");
const cron = require("node-cron");
const mongoose = require("mongoose");
var unirest = require("unirest");
const  sendOTP  = require('./otpService.js');
const otpRequested = require("../models/otpRequested.js");


async function addBooking(bookingData) {
  try {
    // Only validate fields explicitly required by the schema
    const requiredFields = [
      "customer",
      "serviceType",
      "description",
      "scheduledDateTime",
    ];
    for (let field of requiredFields) {
      if (!bookingData[field]) throw new Error(`${field} is required`);
    }

    // Ensure nested required fields are present
    if (
      !bookingData.customer.id ||
      !bookingData.customer.name ||
      !bookingData.customer.phone ||
      !bookingData.customer.email
    ) {
      throw new Error(
        "All customer fields (id, name, phone, email) are required"
      );
    }
    if (
      !bookingData.scheduledDateTime.start ||
      !bookingData.scheduledDateTime.end
    ) {
      throw new Error(
        "scheduledDateTime.start and scheduledDateTime.end are required"
      );
    }
    if (
      !bookingData.payment ||
      !bookingData.payment.totalAmount ||
      bookingData.payment.totalAmount === 0
    ) {
      throw new Error(
        "payment.totalAmount is required and must be greater than 0"
      );
    }
    if (
      !bookingData.location ||
      !bookingData.location.address ||
      !bookingData.location.city ||
      !bookingData.location.state ||
      !bookingData.location.postalCode ||
      !bookingData.location.coordinates ||
      !bookingData.location.coordinates.latitude ||
      !bookingData.location.coordinates.longitude
    ) {
      throw new Error(
        "All location fields (address, city, state, postalCode, coordinates.latitude, coordinates.longitude) are required"
      );
    }

    if (bookingData.assignee?.gardenerRef) {
      bookingData.assignee.gardenerRef = mongoose.Types.ObjectId(
        bookingData.assignee.gardenerRef
      );
    }
    const newBooking = new Booking({
      customer: {
        id: bookingData.customer.id,
        name: bookingData.customer.name,
        phone: bookingData.customer.phone,
        email: bookingData.customer.email,
      },
      serviceType: bookingData.serviceType,
      description: bookingData.description,
      status: bookingData.statusName || "Upcoming",
      scheduledDateTime: {
        start: bookingData.scheduledDateTime.start,
        end: bookingData.scheduledDateTime.end,
      },
      bookingDate: bookingData.bookingDate || new Date(),
      location: {
        address: bookingData.location.address,
        city: bookingData.location.city,
        state: bookingData.location.state,
        postalCode: bookingData.location.postalCode,
        coordinates: {
          latitude: bookingData.location.coordinates.latitude,
          longitude: bookingData.location.coordinates.longitude,
        },
      },
      payment: {
        totalAmount: bookingData.payment.totalAmount,
        companyShare: bookingData.payment.companyShare,
        gardenerShare: bookingData.payment.gardenerShare,
        status: bookingData.payment.status || "pending",
      },
      history: {
        lastModifiedBy: bookingData.userID, // Assuming userID from JWT
      },
    });

    const savedBooking = await newBooking.save();
    return savedBooking;
  } catch (error) {
    throw new Error(`Failed to add booking: ${error.message}`);
  }
}

/**
 * Add booking from email/Google Apps Script
 * This is a separate function to handle email orders with eOrderId
 */
async function addBookingFromEmail(bookingData) {
  try {
    // Only validate fields explicitly required by the schema
    const requiredFields = [
      "customer",
      "serviceType",
      "description",
      "scheduledDateTime",
    ];
    for (let field of requiredFields) {
      if (!bookingData[field]) throw new Error(`${field} is required`);
    }

    // Ensure nested required fields are present
    if (
      !bookingData.customer.name ||
      !bookingData.customer.phone ||
      !bookingData.customer.email
    ) {
      throw new Error(
        "Customer fields (name, phone, email) are required"
      );
    }

    // Generate customer ID if not provided (for email orders)
    if (!bookingData.customer.id) {
      bookingData.customer.id = new mongoose.Types.ObjectId();
    }

    if (
      !bookingData.scheduledDateTime.start ||
      !bookingData.scheduledDateTime.end
    ) {
      throw new Error(
        "scheduledDateTime.start and scheduledDateTime.end are required"
      );
    }

    if (
      !bookingData.payment ||
      !bookingData.payment.totalAmount ||
      bookingData.payment.totalAmount === 0
    ) {
      throw new Error(
        "payment.totalAmount is required and must be greater than 0"
      );
    }

    if (
      !bookingData.location ||
      !bookingData.location.address ||
      !bookingData.location.coordinates ||
      !bookingData.location.coordinates.latitude ||
      !bookingData.location.coordinates.longitude
    ) {
      throw new Error(
        "All location fields (address, coordinates.latitude, coordinates.longitude) are required"
      );
    }

    // ✅ Validate: eOrderId is required for email orders
    if (!bookingData.eOrderId || bookingData.eOrderId.trim() === "") {
      throw new Error(
        "eOrderId is required for email orders"
      );
    }

    // Handle assignee
    if (bookingData.assignee?.gardenerRef) {
      bookingData.assignee.gardenerRef = mongoose.Types.ObjectId(
        bookingData.assignee.gardenerRef
      );
    } else {
      bookingData.assignee = bookingData.assignee || { type: "admin" };
    }

    // Handle materials - ensure they have proper structure
    const materials = (bookingData.materials || []).map(item => ({
      name: item.name || item.title || "Unknown Item",
      price: item.price || 0,
      quantity: item.quantity || 1,
      unit: item.unit || "unit"
    }));

    const newBooking = new Booking({
      customer: {
        id: bookingData.customer.id,
        name: bookingData.customer.name,
        phone: bookingData.customer.phone,
        email: bookingData.customer.email,
      },
      serviceType: bookingData.serviceType,
      description: bookingData.description,
      status: bookingData.statusName || "upcoming",
      eOrderId: bookingData.eOrderId, // ✅ Required for email orders (validated above)
      scheduledDateTime: {
        date: bookingData.scheduledDateTime.start,
        timeSlot: bookingData.scheduledDateTime.timeSlot || "9am-12pm"
      },
      bookingDate: bookingData.bookingDate || new Date(),
      location: {
        address: bookingData.location.address,
        city: bookingData.location.city || "",
        state: bookingData.location.state || "",
        postalCode: bookingData.location.postalCode || "",
        coordinates: {
          latitude: bookingData.location.coordinates.latitude,
          longitude: bookingData.location.coordinates.longitude,
        },
      },
      payment: {
        totalAmount: bookingData.payment.totalAmount,
        companyShare: bookingData.payment.companyShare !== undefined ? bookingData.payment.companyShare : null,
        gardenerShare: bookingData.payment.gardenerShare !== undefined ? bookingData.payment.gardenerShare : null,
        status: bookingData.payment.status || "pending",
      },
      assignee: bookingData.assignee,
      materials: materials, // ✅ Include materials
      history: {
        lastModifiedBy: bookingData.userID || null,
      },
    });

    const savedBooking = await newBooking.save();
    console.log('✅ Booking created from email:', savedBooking._id, 'eOrderId:', savedBooking.eOrderId);
    return savedBooking;
  } catch (error) {
    console.error('❌ Error in addBookingFromEmail:', error);
    throw new Error(`Failed to add booking from email: ${error.message}`);
  }
}

async function updatePayment(bookingId, paymentData, userId) {
  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      "customer.id": userId,
    });
    if (!booking) throw new Error("Booking not found or not authorized");

    booking.payment = {
      totalAmount: paymentData.totalAmount || booking.payment.totalAmount,
      companyShare: paymentData.companyShare || booking.payment.companyShare,
      gardenerShare: paymentData.gardenerShare || booking.payment.gardenerShare,
      status: paymentData.status || booking.payment.status,
      method: paymentData.method || booking.payment.method,
      transactionId: paymentData.transactionId || booking.payment.transactionId,
      paymentDate: paymentData.paymentDate || booking.payment.paymentDate,
      invoice: {
        id: paymentData.invoice?.id || booking.payment.invoice.id,
        url: paymentData.invoice?.url || booking.payment.invoice.url,
        generatedAt:
          paymentData.invoice?.generatedAt ||
          booking.payment.invoice.generatedAt,
        sentToCustomer:
          paymentData.invoice?.sentToCustomer !== undefined
            ? paymentData.invoice.sentToCustomer
            : booking.payment.invoice.sentToCustomer,
      },
    };
    booking.history.lastModifiedAt = new Date();
    booking.history.lastModifiedBy = userId;

    const updatedBooking = await booking.save();
    return updatedBooking;
  } catch (error) {
    throw new Error(`Failed to update payment: ${error.message}`);
  }
}

async function updateVerifiedStatus(bookingId, statusName) {
  try {
    const bookingData = await Booking.findOne({
      _id: bookingId,
      "customer.id": userId,
    });
    if (!bookingData) throw new Error("Booking not found");

    if (bookingData.status !== "pending") {
      throw new Error(`Cannot update status from ${bookingData.status}`);
    }

    if (!["verified", "not_verified"].includes(statusName)) {
      throw new Error(
        `Invalid status '${statusName}'. Valid statuses are: verified, not_verified`
      );
    }

    bookingData.verification.status = statusName;
    bookingData.verification.verifiedAt = new Date();
    bookingData.history.lastModifiedAt = new Date();
    bookingData.history.lastModifiedBy = userId;

    const updatedBooking = await bookingData.save();
    return updatedBooking;
  } catch (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }
}

async function updateToPending(bookingId, userId) {
  // updateTopending => this checks if the order was previously upcoming then only it could be converted to pending
  // and that too in that the if status name if pending => the orde ir being sent from upcomign -> pending in this case we will update the asignee from type admin to type gardener and gardenerRef to the userId (gardener id)

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }
  // Only allow update if current status is "upcoming"
  if (booking.status !== "upcoming") {
    throw new Error("Only upcoming bookings can be converted to pending");
  }

  // Business logic: moving to pending means assigning a gardener
  booking.status = "pending";
  booking.assignee.type = "gardener";
  booking.assignee.gardenerRef = userId; // Gardener's user ID
  booking.history.lastModifiedAt = new Date();

  const updatedBooking = await booking.save();
  return updatedBooking;
}

async function updateToCompleted(bookingId, userId, paymentData) {
  try {
    // Find the booking by ID
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return { success: false, message: "Booking not found", data: null };
    }

    // 1. Status Validation - Only pending bookings can be completed
    if (booking.status !== "pending") {
      return {
        success: false,
        message: `Cannot complete booking with status '${booking.status}'. Only pending bookings can be completed.`,
        data: null,
      };
    }

    // 2. Payment Data Validation - Check external payment response
    if (!paymentData || paymentData.status !== "COMPLETED") {
      return {
        success: false,
        message: "External payment state is not COMPLETED.",
        data: null,
      };
    }

    // Ensure payment details array exists and has at least one entry

    // 3. Payment Amount Validation - Compare booking amount with payment amount
    const paymentAmountInBaseUnit = paymentData.amount / 100; // Convert paisa to rupees
    if (paymentAmountInBaseUnit !== booking.payment.totalAmount) {
      return {
        success: false,
        message: `Payment amount mismatch. Expected ${booking.payment.totalAmount}, but received ${paymentAmountInBaseUnit}.`,
        data: null,
      };
    }

    // 4. Verification Validation - Booking should be verified
    if (!booking.verification || booking.verification.status !== "verified") {
      return {
        success: false,
        message: "Booking must be verified before marking as completed",
        data: null,
      };
    }

    // 5. Service Assignment Validation - Must be assigned to a gardener
    if (booking.assignee.type !== "gardener" || !booking.assignee.gardenerRef) {
      return {
        success: false,
        message: "Booking must be assigned to a gardener before completion",
        data: null,
      };
    }

    // 6. Optional: Additional validation checks (e.g., materials documented)
    // ...

    // --- All Validations Passed ---

    // Update booking status
    booking.status = "completed";

    // Update payment details from paymentData
    booking.payment.status = "paid"; // Mark as paid
    booking.payment.transactionId = primaryPaymentDetail.transactionId;
    booking.payment.paymentDate = new Date(primaryPaymentDetail.timestamp); // Convert timestamp
    booking.payment.method = primaryPaymentDetail.paymentMode;

    // Update history
    booking.history.completedAt = new Date();
    booking.history.lastModifiedAt = new Date();
    booking.history.lastModifiedBy = userId;

    // Update financial status
    booking.financialStatus = "closed";

    // Save the updated booking
    const updatedBooking = await booking.save();

    // Return success response
    return {
      success: true,
      message: "Booking completed successfully",
      data: updatedBooking,
    };
  } catch (error) {
    // Log the detailed error internally if needed
    // console.error("Error in updateToCompleted:", error);

    // Return failure response for unexpected errors
    return {
      success: false,
      message: `Failed to mark booking as completed: ${error.message}`,
      data: null,
    };
  }
}

async function updateToCancelled(bookingId, userId, cancellationData = {}) {
  try {
    // Find the booking
    console.log("Booking ID: "+ bookingId);
    console.log("User ID: "+userId);
    const response = {
      status: false,
      message: "Booking not found",
      data: null,
    };
    const booking = await Booking.findById(bookingId);
    console.log("booking data :"+booking);
    if (!booking) {
      response.message = "Booking not found";
      return response;
    }

    // Status validation - Only pending bookings can be cancelled
    if (booking.status !== "upcoming") {
      response.message = "Only upcoming bookings can be cancelled";
      console.log("only upcoming bookings can be cancelled");
      return response;
    }

    // Service timing validation - Prevent last-minute cancellations

    // Update status and record cancellation details
    /*
     * Should the access be given back to admin or not ?
     * If the booking is cancelled then the admin should be able to see the booking and the gardener should not be able to see it in his bookings list
     * So the status should be updated to cancelled and the gardener should not be able to see it in his bookings list
     * means after update we need to update the status to cancelled and the gardener should not be able to see it in his bookings list
     */

    // Changing access to admin and gardener based on the status of the booking
    // booking.assignee.type = 'admin'; // Change to admin type
    // booking.assignee.gardenerRef = null; // Remove gardener reference

    booking.status = "canceled"; // Note: Schema uses 'canceled' not 'cancelled'
    booking.cancellation = {
      reason: cancellationData.reason || "Cancelled by user",
      canceledBy:
        cancellationData.canceledBy || (userId ? "gardener" : "system"),
      canceledAt: new Date(),
    };

    // Update history tracking
    booking.history.canceledAt = new Date();
    booking.history.lastModifiedAt = new Date();
    booking.history.lastModifiedBy = userId || null; // this signs that this was cancled

    // Handle notification flag if applicable
    if (cancellationData.notifyCustomer) {
      // Flag for notification system to send cancellation notice
      booking.cancellation.notificationSent = false;
    }

    // Save the updated booking
    const updatedBooking = await booking.save();
    console.log("updated booking data :"+ updatedBooking);
    response.status = true;
    response.message = "Booking cancelled successfully";
    response.data = updatedBooking;
    return response;
  } catch (error) {
    throw new Error(`Failed to cancel booking: ${error.message}`);
  }
}

async function cancelled(userId) {
  try {
    const allCancelledBookings = await Booking.find({
      "customer.id": userId,
      status: "Cancelled",
    });
    return allCancelledBookings;
  } catch (error) {
    throw new Error("Failed to fetch cancelled bookings: " + error.message);
  }
}

async function completed(userId) {
  try {
    const allCompletedBookings = await Booking.find({
      "customer.id": userId,
      status: "Completed",
    });
    return allCompletedBookings;
  } catch (error) {
    throw new Error("Failed to fetch completed bookings: " + error.message);
  }
}

async function upcoming(userId) {
  try {
    const allUpcomingBookings = await Booking.find({
      "customer.id": userId,
      status: "Upcoming",
    });
    return allUpcomingBookings;
  } catch (error) {
    throw new Error(`Failed to fetch upcoming bookings: ${error.message}`);
  }
}
async function notverified(userId) {
  try {
    console.log("Looking for not verified bookings with userId:"+userId);
    const allNotVerifiedBookings = await Booking.find({
      "assignee.type": "gardener",
      "assignee.gardenerRef": userId,
      status: "pending",
    });
    return allNotVerifiedBookings;
  } catch (error) {
    throw new Error(`Failed to fetch not verified bookings: ${error.message}`);
  }
}

async function acceptedIncoming(userId) {
  try {
    const allAcceptedIncomingBookings = await Booking.find({
      "customer.id": userId,
      status: "Assigned",
      // 'assignee.type': 'gardener'
    });
    return allAcceptedIncomingBookings;
  } catch (error) {
    throw new Error(
      "Failed to fetch accepted incoming bookings: " + error.message
    );
  }
}

async function pending(userId) {
  console.log("Looking for pending bookings with userId:"+ userId);
  try {
    const allPendingBookings = await Booking.find({
      "assignee.type": "gardener",
      "assignee.gardenerRef": userId.toString(), // keep as string
      status: "pending",
    });

    console.log("All pending bookings:"+ allPendingBookings); // Debugging line to check bookings

    return allPendingBookings;
  } catch (error) {
    throw new Error("Failed to fetch pending bookings: " + error.message);
  }
}

async function updateExpiredBookings() {
  try {
    const now = new Date();
    const bookingsToUpdate = await Booking.find({
      "scheduledDateTime.start": { $lt: now },
      status: { $ne: "expired" },
    });

    for (const booking of bookingsToUpdate) {
      booking.status = "expired";
      booking.history.lastModifiedAt = now;
      booking.history.lastModifiedBy = "system"; // Assuming system updates expired bookings
      await booking.save();
      console.log(`Updated booking ${booking._id} to Expired`);
    }
  } catch (error) {
    console.error("Failed to update expired bookings:", error.message);
  }
}

cron.schedule("0 0 9,12,15,18,21 * * *", async () => {
  try {
    console.log(
      "Running job to update expired bookings at",
      new Date().toLocaleTimeString()
    );
    await updateExpiredBookings();
    console.log("Expired bookings updated successfully.");
  } catch (error) {
    console.error(
      "Error during job to update expired bookings:",
      error.message
    );
  }
});

async function addRating(bookingId, ratingData, userId) {
  try {
    const requiredFields = ["score"];
    for (let field of requiredFields) {
      if (!ratingData[field]) throw new Error(`${field} is required`);
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      "customer.id": userId,
    });
    if (!booking) throw new Error("Booking not found or not authorized");

    if (booking.status !== "Completed") {
      throw new Error("Ratings can only be submitted for completed bookings");
    }

    booking.rating = {
      score: ratingData.score,
      review: ratingData.review || null,
      submittedAt: new Date(),
    };
    booking.history.lastModifiedAt = new Date();
    booking.history.lastModifiedBy = userId;

    const updatedBooking = await booking.save();
    return updatedBooking;
  } catch (error) {
    throw new Error(`Failed to add rating: ${error.message}`);
  }
}

async function getRating(bookingId, userId) {
  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      "customer.id": userId,
    });
    if (!booking) throw new Error("Booking not found or not authorized");

    if (!booking.rating || !booking.rating.submittedAt) {
      return { message: "No rating submitted yet" };
    }

    return booking.rating;
  } catch (error) {
    throw new Error(`Failed to fetch rating: ${error.message}`);
  }
}

async function getAvgRating(userId) {
  try {
    const allOrders = await Booking.find({
      "customer.id": userId,
      "rating.score": { $ne: null },
    });

    if (allOrders.length === 0) {
      return { averageRating: 0 };
    }

    const totalRating = allOrders.reduce(
      (sum, order) => sum + (order.rating.score || 0),
      0
    );
    const avgRating = totalRating / allOrders.length;
    return { averageRating: avgRating };
  } catch (error) {
    throw new Error(`Average rating not fetched properly: ${error.message}`);
  }
}

async function getFilteredBookings(filter) {
  try {
    const result = {
      gardening: { upcoming: [], pending: [], completed: [], canceled: [] },
      plantation: { upcoming: [], pending: [], completed: [], canceled: [] },
    };

    let query = {};

    if (filter.gardenerId) {
      query = {
        "assignee.type": "gardener",
        "assignee.gardenerRef": new mongoose.Types.ObjectId(filter.gardenerId),
      };
    }

    const bookings = await Booking.find(query).sort({
      "scheduledDateTime.date": 1,
    });
    console.log("bookings"+ bookings.length);
    for (const booking of bookings) {
      const { serviceType, status } = booking;
      console.log(`\n\n-----\nProcessing booking with serviceType: ${serviceType}, status: ${status} :: pushable -- ${result[serviceType] && result[serviceType][status]}`)
      if (result[serviceType] && result[serviceType][status]) {
        result[serviceType][status].push(booking);
      }
    }
    // print length of each part of result ie. len of upcoming, pending, completed, canceled in both gardening and plantation
    console.log(` ##############################################
    gardening upcoming: ${result.gardening.upcoming.length},
    gardening pending: ${result.gardening.pending.length},
    gardening completed: ${result.gardening.completed.length},
    gardening canceled: ${result.gardening.canceled.length},
      ---------------------------------
    plantation upcoming: ${result.plantation.upcoming.length},
    plantation pending: ${result.plantation.pending.length},
    plantation completed: ${result.plantation.completed.length},
    plantation canceled: ${result.plantation.canceled.length}
    ##############################################`);

    return { status: "success", data: result };
  } catch (error) {
    console.log(error.message);
    return { status: "error", message: "server error occured", data: [] };
  }
}

const verifyOTP = async (orderId, otp) => {
  const order = await Booking.findOne({ _id:orderId });
  if (!order) {
    console.log(`order not found for orderId: ${orderId}`);
     return { status: 'error', message: 'OTP request not found for given phone number' }
  }
  console.log(`Found order: ${order._id}`);

  const otpRecord = await otpRequested.findOne({
    orderId: order._id,
    otp,
  });
  console.log(otpRecord);
  if (!otpRecord) {
    const allRecords = await otpRequested.find({orderId: order._id });
    console.log(
      "All OTP records for this user:"+
      JSON.stringify(allRecords, null, 2)
    );
   if (allRecords.length === 0) {
      return { status: 'error', message: 'OTP request not found for given phone number' }
    }
    return { status: 'error', message: 'Invalid OTP entered' }
  }
  console.log(
    `Found OTP record: ${otpRecord._id}, OTP: ${otpRecord.otp}, Expiry: ${otpRecord.expiryTime}, Status: ${otpRecord.status}`
  );

  if (otpRecord.expiryTime < new Date()) {
    await otpRequested.updateOne(
      { _id: otpRecord._id },
      { status: "Expired" }
    );
    return { status: 'error', message: 'OTP request has expired' }
  }

  await otpRequested.updateOne(
    { _id: otpRecord._id },
    { status: "Verified" }
  );
  await otpRequested.deleteOne({ _id: otpRecord._id });
  console.log(`Verified OTP for order: ${order._id}`);
  return { orderid: order._id, status: "success" };
};

const initiateOTP = async (phoneNumber, orderId) => {
  console.log("Initiating OTP for order ID:", orderId, "and phone number:", phoneNumber);

  let order = await Booking.findOne({ _id:orderId });
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // generate otp
  if (!order) {
    throw new Error("order not found");
  }
  console.log(`Found order id: ${order._id}`);
  console.log(`Sending OTP --------------------> ${otp}`);
  const expiryTime = new Date(Date.now() + 10 * 60 * 1000);
  await otpRequested.deleteMany({ orderId: order._id });

  const otpRecord = new otpRequested({
    orderId: order._id,
    customerNumber: phoneNumber,
    otp,
    expiryTime,
    status: "Pending",
  });
  await otpRecord.save();
  try {
    process.env.NODE_ENV === 'production' && await sendOTP(phoneNumber, otp) ;
  } catch (err) {
    console.error("Failed to send OTP:", err.message);
    return { status: 'error', message: err.message };
  }
  return { orderid: order._id, status: 'success' };
  
};
const initiateOTPForBill = async (phoneNumber) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // generate otp

    console.log(`Sending OTP --------------------> ${otp}`);
    const expiryTime = new Date(Date.now() + 10 * 60 * 1000);
    await sendOTP(phoneNumber, otp);
  } catch (error) {
    console.log("Error while sending the otp in the bill summary page...");
    
  }
};

module.exports = {
  addBooking,
  addBookingFromEmail,
  cancelled,
  completed,
  upcoming,
  acceptedIncoming,
  pending,
  addRating,
  getRating,
  updatePayment,
  getAvgRating,
  notverified,
  updateVerifiedStatus,
  getFilteredBookings,
  verifyOTP,
  initiateOTP,
  updateToPending,
  updateToCancelled,
  updateToCompleted,
  initiateOTPForBill
};
