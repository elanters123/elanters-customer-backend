// controllers/mobile/cartController.js
const CustomerCart = require('../../models/CustomerCart');
const Item = require('../../models/Item');
const { attachResolvedImagesToCart } = require('../../services/productImageService');

const getCart = async (req, res) => {
  try {
    const cart = await CustomerCart.findOne({ customerId: req.customerId }).populate(
      'items.productId',
      'name price images imageIds offer stock'
    );
    if (!cart) {
      return res.json({ success: true, cart: { items: [], couponCode: null, couponDiscount: 0 } });
    }
    const resolved = await attachResolvedImagesToCart(cart, req);
    res.json({ success: true, cart: resolved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, variantLabel = '' } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    const product = await Item.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ success: false, message: 'Insufficient stock' });

    let cart = await CustomerCart.findOne({ customerId: req.customerId });
    if (!cart) cart = new CustomerCart({ customerId: req.customerId, items: [] });

    const existing = cart.items.find(
      (i) => i.productId.toString() === productId && i.variantLabel === variantLabel
    );

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({ productId, variantLabel, quantity, priceAtAdd: product.price });
    }

    await cart.save();
    const populated = await CustomerCart.findById(cart._id).populate(
      'items.productId',
      'name price images imageIds offer stock'
    );
    const resolved = await attachResolvedImagesToCart(populated, req);
    res.json({ success: true, cart: resolved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const { productId, quantity, variantLabel = '' } = req.body;
    const cart = await CustomerCart.findOne({ customerId: req.customerId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.find(
      (i) => i.productId.toString() === productId && i.variantLabel === variantLabel
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not in cart' });

    if (quantity <= 0) {
      cart.items = cart.items.filter(
        (i) => !(i.productId.toString() === productId && i.variantLabel === variantLabel)
      );
    } else {
      item.quantity = quantity;
    }

    await cart.save();
    const populated = await CustomerCart.findById(cart._id).populate(
      'items.productId',
      'name price images imageIds offer stock'
    );
    const resolved = await attachResolvedImagesToCart(populated, req);
    res.json({ success: true, cart: resolved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const clearCart = async (req, res) => {
  try {
    await CustomerCart.findOneAndUpdate(
      { customerId: req.customerId },
      { $set: { items: [], couponCode: null, couponDiscount: 0 } }
    );
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getCart, addToCart, updateCartItem, clearCart };
