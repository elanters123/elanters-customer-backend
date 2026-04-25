
const Booking=require("../models/Booking.js")
const mongoose = require("mongoose");

const getGardenerRating = async (req, res) => {
  try {
    const gardenerId = req.params.id;
    console.log("Gardener Id : "+ gardenerId);

    if (!gardenerId) {
      return res.status(400).json({ error: "Gardener ID is required." });
    }

    // You can also validate the ID here
    if (!mongoose.Types.ObjectId.isValid(gardenerId)) {
      return res.status(400).json({ error: "Invalid Gardener ID." });
    }

    const gardenerRatings = await Booking.find({ "assignee.gardenerRef":gardenerId,rating: { $ne: null }});
    console.log("Gardener ratings:"+gardenerRatings);
    
    if (!gardenerRatings.length) {
      return res.status(200).json({ averageRating: 0 });
    }

    // Calculate average
    const total = gardenerRatings.reduce((sum, r) => sum + r.rating.score, 0);
    const average = total / gardenerRatings.length;
    console.log("Average Rating:"+ average);

    return res.status(200).json({ averageRating: average.toFixed(1) });
  } catch (error) {
    console.log(
      "Error while obtaining the rating of the gardener",
      error.message
    );
  }
};

const createRating = async (req, res) => {
  try {
    const { gardenerId, orderId, rating, comment } = req.body;
    console.log("Gardener Id: "+ gardenerId);
    console.log("Order Id:"+ orderId);
    console.log("Rating given:"+ rating);

    // Check if either is undefined/null
    if (!gardenerId || !orderId) {
      return res
        .status(400)
        .json({ error: "gardenerId and orderId are required." });
    }

    // Check if both are valid MongoDB ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(gardenerId) ||
      !mongoose.Types.ObjectId.isValid(orderId)
    ) {
      return res.status(400).json({ error: "Invalid gardenerId or orderId." });
    }
    // const isRatingOrderExist=await Rating.find({gardenerId,orderId});
    // if (isRatingOrderExist.length>0){
    //     return res.status(400).json({message:"Rating for this order already exists"});
    // }

    // const ratingInstance = await Rating.create({
    //   gardenerId,
    //   orderId,
    //   rating,
    //   comment
    // });
    const bookingRating = await Booking.findById(orderId);
    if (bookingRating.rating) {
      res.status(200).json({ message: "Rating to this order already exists" });
    }
    const ratingVal = {
      score: rating,
      review: comment,
      submittedAt:new Date()
    };
    bookingRating.rating = ratingVal;
    bookingRating.history.lastModifiedAt = new Date();
    bookingRating.history.lastModifiedBy = gardenerId;
    await bookingRating.save();

    return res.status(200).json({ message: "Rating added successfully" });
  } catch (error) {
    console.log("Error while creating rating", error.message);
  }
};

module.exports = { getGardenerRating, createRating };
