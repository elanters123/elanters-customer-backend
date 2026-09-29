// Mirror mobile plant CustomerOrder into Booking so Admin (Order = Booking) can see it.
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const { resolveEOrderIdForCreate } = require('../utils/eOrderId');
const logger = require('../utils/logger');

const NOTES_PREFIX = 'mobile-plant-order:';

function mobilePlantNotes(customerOrderId) {
  return `${NOTES_PREFIX}${String(customerOrderId)}`;
}

function materialsFromOrderItems(items = []) {
  return (items || []).map((item) => ({
    id: item.productId || item.id || undefined,
    name: item.name || 'Plant item',
    price: Number(item.price) || 0,
    quantity: Number(item.quantity) || 1,
    unit: 'pcs',
    isAdHoc: false,
  }));
}

/**
 * Create a plantation Booking from a paid CustomerOrder (idempotent).
 * Does not throw — logs and returns null on failure so payment confirm still succeeds.
 */
async function syncCustomerOrderToPlantationBooking({
  customerId,
  order,
  deliveryAddress,
  razorpayPaymentId,
  clientPlatform = 'android',
}) {
  if (!order?._id || !customerId) return null;

  const notes = mobilePlantNotes(order._id);
  const existing = await Booking.findOne({
    $or: [
      { notes },
      ...(razorpayPaymentId
        ? [{ 'payment.transactionId': String(razorpayPaymentId) }]
        : []),
    ],
  })
    .select('_id eOrderId')
    .lean();

  if (existing) {
    logger.info('Plant Booking already synced', 'Orders', {
      customerOrderId: String(order._id),
      bookingId: String(existing._id),
    });
    return existing;
  }

  const customer = await Customer.findById(customerId)
    .select('name phoneNumber emailId')
    .lean();
  const addr = deliveryAddress || order.deliveryAddress || {};
  const phone =
    addr.phone ||
    customer?.phoneNumber ||
    '0000000000';
  const email =
    (addr.email && String(addr.email).trim()) ||
    customer?.emailId ||
    `customer+${String(phone).replace(/\D/g, '').slice(-10) || 'unknown'}@elanters.app`;
  const name =
    addr.fullName ||
    customer?.name ||
    'Customer';

  const materials = materialsFromOrderItems(order.items);
  const itemCount = materials.reduce((n, m) => n + (Number(m.quantity) || 0), 0);
  const total = Number(order.total) || 0;

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 2);
  deliveryDate.setHours(0, 0, 0, 0);

  const eOrderId = await resolveEOrderIdForCreate(Booking, {
    clientPlatform,
    channel: clientPlatform,
  });

  try {
    const booking = await Booking.create({
      serviceType: 'plantation',
      description: `Plant delivery — ${itemCount || materials.length} item${
        (itemCount || materials.length) === 1 ? '' : 's'
      } (app)`,
      status: 'upcoming',
      eOrderId,
      notes,
      customer: {
        id: customerId,
        name,
        phone,
        email,
      },
      scheduledDateTime: {
        date: deliveryDate,
        timeSlot: '9am-12pm',
      },
      location: {
        address: addr.line1 || addr.address || 'Address pending',
        city: addr.city || '',
        state: addr.state || '',
        postalCode: addr.pincode || addr.postalCode || '',
        coordinates: { latitude: 0, longitude: 0 },
      },
      materials,
      payment: {
        totalAmount: total,
        status: 'paid',
        method: 'online',
        prePaidAmount: total,
        transactionId: razorpayPaymentId || order.razorpayPaymentId || null,
        paymentDate: new Date(),
        companyShare: 0,
        gardenerShare: 0,
      },
      coupon: {
        code: order.couponCode || null,
        discountAmount: Number(order.discount) || 0,
        appliedAt: order.couponCode ? new Date() : null,
      },
      assignee: { type: 'admin', gardenerRef: null },
      history: {
        createdAt: new Date(),
        lastModifiedAt: new Date(),
      },
    });

    logger.info('Plant CustomerOrder synced to Booking', 'Orders', {
      customerOrderId: String(order._id),
      bookingId: String(booking._id),
      eOrderId: booking.eOrderId,
      total,
    });
    return booking;
  } catch (err) {
    logger.error('Failed syncing plant CustomerOrder to Booking', 'Orders', {
      customerOrderId: String(order._id),
      message: err.message,
    });
    return null;
  }
}

function isMobilePlantOrderBooking(booking) {
  return String(booking?.notes || '').startsWith(NOTES_PREFIX);
}

module.exports = {
  NOTES_PREFIX,
  mobilePlantNotes,
  syncCustomerOrderToPlantationBooking,
  isMobilePlantOrderBooking,
};
