// controllers/web/profileController.js
const Customer = require('../../models/Customer');

function syncAddressList(customer) {
  // no-op: single source of truth is customer.addresses
}

function applySelectedAddressToRoot(customer) {
  const addresses = customer.addresses || [];
  const def = addresses.find((a) => a.isDefault);
  const selected = def || addresses[0] || null;

  if (!selected) {
    customer.address = '';
    customer.city = '';
    customer.state = '';
    customer.pincode = '';
    return;
  }
  customer.address = [selected.line1, selected.line2].filter(Boolean).join(', ');
  customer.city = selected.city || '';
  customer.state = selected.state || '';
  customer.pincode = selected.pincode || '';
}

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

// Addresses
const getAddresses = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId).select('addresses');
    res.json({
      success: true,
      addresses: customer?.addresses || [],
    });
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

    const isDefault = Boolean(req.body?.isDefault);
    if (isDefault) {
      customer.addresses.forEach((a) => { a.isDefault = false; });
    }
    customer.addresses.push(req.body);
    if (!customer.addresses.some((a) => a.isDefault)) {
      const first = customer.addresses[0];
      if (first) first.isDefault = true;
    }
    syncAddressList(customer);
    applySelectedAddressToRoot(customer);
    await customer.save();
    res.status(201).json({
      success: true,
      addresses: customer.addresses,
    });
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

    if (req.body?.isDefault) {
      customer.addresses.forEach((a) => { a.isDefault = false; });
    }
    Object.assign(address, req.body);
    if (!customer.addresses.some((a) => a.isDefault)) {
      address.isDefault = true;
    }
    syncAddressList(customer);
    applySelectedAddressToRoot(customer);
    await customer.save();
    res.json({
      success: true,
      addresses: customer.addresses,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const toDeleteId = req.params.addressId;
    customer.addresses.pull({ _id: toDeleteId });
    if (!customer.addresses.some((a) => a.isDefault)) {
      const first = customer.addresses[0];
      if (first) first.isDefault = true;
    }
    syncAddressList(customer);
    applySelectedAddressToRoot(customer);
    await customer.save();
    res.json({
      success: true,
      addresses: customer.addresses,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProfile, updateProfile, getAddresses, addAddress, updateAddress, deleteAddress };
