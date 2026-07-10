// services/pushNotificationService.js
// Sends Expo push notifications to registered customer devices.

const CustomerPushToken = require('../models/CustomerPushToken');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

async function notifyBookingConfirmed(customerId, booking) {
  const dateRaw = booking?.scheduledDateTime?.date || booking?.scheduledDate;
  const date = dateRaw
    ? new Date(dateRaw).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const slot = booking?.scheduledDateTime?.timeSlot || booking?.timeSlot || booking?.slotLabel || '';
  const when = [date, slot].filter(Boolean).join(' · ');

  try {
    await sendPushToCustomer(customerId, {
      title: 'Booking confirmed',
      body: when
        ? `Your gardener visit is confirmed for ${when}.`
        : 'Your gardener visit is confirmed.',
      data: {
        screen: 'booking',
        bookingId: String(booking?._id || booking?.id || ''),
        id: String(booking?._id || booking?.id || ''),
      },
    });
  } catch (err) {
    console.warn('[push] notifyBookingConfirmed failed:', err?.message || err);
  }
}

module.exports = {
  sendPushToCustomer,
  notifyBookingConfirmed,
};
