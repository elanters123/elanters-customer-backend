// services/profileService.js
// Customer profile business logic.
const Customer = require('../models/Customer');

const getCustomer = async (customerId) => {
  const customer = await Customer.findById(customerId).select('-__v');
  if (!customer) throw new Error('Customer not found');
  return customer;
};

const updateCustomer = async (customerId, updates) => {
  const allowed = ['name', 'email', 'profilePhoto'];
  const sanitized = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  const customer = await Customer.findByIdAndUpdate(
    customerId,
    { $set: sanitized },
    { new: true, runValidators: true }
  ).select('-__v');
  if (!customer) throw new Error('Customer not found');
  return customer;
};

module.exports = { getCustomer, updateCustomer };
