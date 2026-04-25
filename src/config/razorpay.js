const razorpay = require('razorpay');
const dotenv = require('dotenv');


exports.createRazorpayInstance = () => {
    return new razorpay({
        key_id: process.env.RAZ_ID,
        key_secret: process.env.RAZ_SECRET
    });
} 
