// services/pushNotificationService.js
// Sends Expo push notifications to registered customer devices.

const CustomerPushToken = require('../models/CustomerPushToken');
const BookingPushReceipt = require('../models/BookingPushReceipt');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function formatWhen(booking) {
  const dateRaw = booking?.scheduledDateTime?.date || booking?.scheduledDate;
  const date = dateRaw
    ? new Date(dateRaw).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const slot = booking?.scheduledDateTime?.timeSlot || booking?.timeSlot || booking?.slotLabel || '';
  return [date, slot].filter(Boolean).join(' · ');
}

function bookingIdOf(booking) {
  return String(booking?._id || booking?.id || '');
}

function customerIdOf(booking, fallback) {
  return fallback || booking?.customer?.id || booking?.customerId || null;
}

const BOOKING_PUSH = {
  confirmed: {
    title: 'Booking confirmed',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `Your gardener visit is confirmed for ${when}.`
        : 'Your gardener visit is confirmed.';
    },
  },
  assigned: {
    title: 'Gardener assigned',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `A gardener has been assigned for your visit on ${when}.`
        : 'A gardener has been assigned to your booking.';
    },
  },
  completed: {
    title: 'Visit completed',
    body: () => 'Your gardener visit is done. Thank you for choosing Elanters.',
  },
  canceled: {
    title: 'Booking canceled',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `Your gardener visit on ${when} has been canceled.`
        : 'Your gardener visit has been canceled.';
    },
  },
};

/**
 * @param {string|import('mongoose').Types.ObjectId} customerId
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
async function sendPushToCustomer(customerId, { title, body, data = {} }) {
  if (!customerId || !title || !body) {
    return { sent: 0, tickets: [] };
  }

  const rows = await CustomerPushToken.find({ customerId }).lean();
  if (!rows.length) {
    return { sent: 0, tickets: [] };
  }

  const messages = rows.map((row) => ({
    to: row.token,
    sound: 'default',
    title,
    body,
    data,
    channelId: 'default',
    priority: 'high',
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const json = await response.json().catch(() => ({}));
  const tickets = Array.isArray(json?.data) ? json.data : [];

  const invalidTokens = [];
  tickets.forEach((ticket, index) => {
    if (ticket?.status === 'error') {
      const err = ticket.details?.error;
      if (err === 'DeviceNotRegistered' || err === 'InvalidCredentials') {
        invalidTokens.push(rows[index]?.token);
      }
    }
  });

  if (invalidTokens.length) {
    await CustomerPushToken.deleteMany({ token: { $in: invalidTokens.filter(Boolean) } });
  }

  return { sent: messages.length, tickets };
}

async function claimPushReceipt(bookingId, kind) {
  if (!bookingId || !kind) return false;
  try {
    await BookingPushReceipt.create({ bookingId, kind });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false; // already sent
    throw err;
  }
}

async function notifyBookingEvent(customerId, booking, kind) {
  const tpl = BOOKING_PUSH[kind];
  if (!tpl) return;
  const id = bookingIdOf(booking);
  try {
    const claimed = await claimPushReceipt(id, kind);
    if (!claimed) return;

    await sendPushToCustomer(customerIdOf(booking, customerId), {
      title: tpl.title,
      body: tpl.body(booking),
      data: {
        screen: 'booking',
        bookingId: id,
        id,
        type: kind,
      },
    });
  } catch (err) {
    console.warn(`[push] notifyBookingEvent(${kind}) failed:`, err?.message || err);
  }
}

async function notifyBookingConfirmed(customerId, booking) {
  return notifyBookingEvent(customerId, booking, 'confirmed');
}

async function notifyGardenerAssigned(customerId, booking) {
  return notifyBookingEvent(customerId, booking, 'assigned');
}

async function notifyBookingCompleted(customerId, booking) {
  return notifyBookingEvent(customerId, booking, 'completed');
}

async function notifyBookingCanceled(customerId, booking) {
  return notifyBookingEvent(customerId, booking, 'canceled');
}

module.exports = {
  sendPushToCustomer,
  notifyBookingEvent,
  notifyBookingConfirmed,
  notifyGardenerAssigned,
  notifyBookingCompleted,
  notifyBookingCanceled,
};
