// controllers/web/profileController.js
const Customer = require('../../models/Customer');

const getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId).select('-__v');
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, email, profilePhoto } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (profilePhoto !== undefined) updates.profilePhoto = profilePhoto;

    const customer = await Customer.findByIdAndUpdate(
      req.customerId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Addresses
const getAddresses = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId).select('addresses');
    res.json({ success: true, addresses: customer?.addresses || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (customer.addresses.length >= 5)
      return res.status(400).json({ success: false, message: 'Maximum 5 addresses allowed' });

    customer.addresses.push(req.body);
    await customer.save();
    res.status(201).json({ success: true, addresses: customer.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const address = customer.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    Object.assign(address, req.body);
    await customer.save();
    res.json({ success: true, addresses: customer.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    customer.addresses.pull({ _id: req.params.addressId });
    await customer.save();
    res.json({ success: true, addresses: customer.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProfile, updateProfile, getAddresses, addAddress, updateAddress, deleteAddress };
