// controllers/mobile/profileController.js
// Same logic as web — mobile gets identical profile data.
// Separated so mobile-specific fields (e.g. pushToken) can be added here later.

const Customer = require('../../models/Customer');
const CustomerPushToken = require('../../models/CustomerPushToken');

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
    const { name, emailId, profilePhoto, accountStatus } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (emailId !== undefined) updates.emailId = emailId;
    if (accountStatus !== undefined) {
      updates.accountStatus = accountStatus;
      updates.isActive = accountStatus === 'active';
    }
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

const registerPushToken = async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token || !platform)
      return res.status(400).json({ success: false, message: 'token and platform are required' });

    await CustomerPushToken.findOneAndUpdate(
      { token },
      { customerId: req.customerId, token, platform },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Push token registered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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

module.exports = { getProfile, updateProfile, registerPushToken, getAddresses, addAddress, deleteAddress };
