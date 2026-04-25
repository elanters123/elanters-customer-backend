const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    unit: {
        type: String,
        enum: ['kg', 'litre', 'pcs', 'packet', 'set', 'bag', 'unit'],
    },
    category: {
        type: String,
        required: true,
        trim: true,
    },
    careInstruction: [String],
    longDescription: {
        type: String,
        required: true,
        trim: true,
    },
    shortDescription: {
        type: String,
        required: true,
        trim: true,
    },
    offer: {
        type: Number,
        required: true,
        min: 0,
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
    },
    images: [String]
}, {
    timestamps: true
});

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;

