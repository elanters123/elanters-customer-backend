// services/pushNotificationService.js
// Sends Expo push notifications to registered customer devices.

const mongoose = require('mongoose');
const CustomerPushToken = require('../models/CustomerPushToken');
const BookingPushReceipt = require('../models/BookingPushReceipt');
const OrderPushReceipt = require('../models/OrderPushReceipt');

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

function orderIdOf(order) {
  return String(order?._id || order?.id || '');
}

function customerIdOf(booking, fallback) {
  return fallback || booking?.customer?.id || booking?.customerId || null;
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
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
    console.warn('[push] skip send — missing customerId/title/body', {
      customerId: customerId ? String(customerId) : null,
      title: Boolean(title),
      body: Boolean(body),
    });
    return { sent: 0, tickets: [] };
  }

  const oid = toObjectId(customerId);
  const query = oid
    ? { $or: [{ customerId: oid }, { customerId: String(customerId) }] }
    : { customerId: String(customerId) };

  const rows = await CustomerPushToken.find(query).lean();
  if (!rows.length) {
    console.warn(
      `[push] no device tokens for customer=${String(customerId)} — ask user to allow notifications and reopen app`,
    );
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

  console.log(
    `[push] sending to customer=${String(customerId)} devices=${messages.length} title="${title}"`,
  );

  let response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.warn('[push] Expo HTTP request failed:', err?.message || err);
    return { sent: 0, tickets: [], error: err?.message || String(err) };
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('[push] Expo API error', response.status, JSON.stringify(json).slice(0, 500));
  }

  const tickets = Array.isArray(json?.data) ? json.data : [];

  const invalidTokens = [];
  tickets.forEach((ticket, index) => {
    if (ticket?.status === 'error') {
      const err = ticket.details?.error || ticket.message;
      console.warn(
        `[push] ticket error device=${index} token=${String(rows[index]?.token || '').slice(0, 24)}…`,
        err,
      );
      if (err === 'DeviceNotRegistered' || err === 'InvalidCredentials') {
        invalidTokens.push(rows[index]?.token);
      }
    } else if (ticket?.status === 'ok') {
      console.log(`[push] ticket ok device=${index} id=${ticket.id || ''}`);
    }
  });

  if (invalidTokens.length) {
    await CustomerPushToken.deleteMany({ token: { $in: invalidTokens.filter(Boolean) } });
    console.warn(`[push] removed ${invalidTokens.length} invalid token(s)`);
  }

  return { sent: messages.length, tickets };
}

async function claimBookingPushReceipt(bookingId, kind) {
  if (!bookingId || !kind) return false;
  try {
    await BookingPushReceipt.create({ bookingId, kind });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false; // already sent
    throw err;
  }
}

async function claimOrderPushReceipt(orderId, kind) {
  if (!orderId || !kind) return false;
  try {
    await OrderPushReceipt.create({ orderId, kind });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function notifyBookingEvent(customerId, booking, kind) {
  const tpl = BOOKING_PUSH[kind];
  if (!tpl) return { sent: 0 };
  const id = bookingIdOf(booking);
  try {
    const claimed = await claimBookingPushReceipt(id, kind);
    if (!claimed) {
      console.log(`[push] booking ${id} kind=${kind} already notified — skip`);
      return { sent: 0, skipped: true };
    }

    const result = await sendPushToCustomer(customerIdOf(booking, customerId), {
      title: tpl.title,
      body: tpl.body(booking),
      data: {
        screen: 'booking',
        bookingId: id,
        id,
        type: kind,
      },
    });
    return result;
  } catch (err) {
    console.warn(`[push] notifyBookingEvent(${kind}) failed:`, err?.message || err);
    return { sent: 0, error: err?.message || String(err) };
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

/**
 * Catalog / plant order paid & confirmed.
 * @param {string|import('mongoose').Types.ObjectId} customerId
 * @param {object} order
 */
async function notifyOrderConfirmed(customerId, order) {
  const id = orderIdOf(order);
  const cid = customerId || order?.customerId;
  try {
    const claimed = await claimOrderPushReceipt(id, 'confirmed');
    if (!claimed) {
      console.log(`[push] order ${id} confirmed already notified — skip`);
      return { sent: 0, skipped: true };
    }

    const itemCount = Array.isArray(order?.items)
      ? order.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)
      : 0;
    const total =
      order?.total != null
        ? `₹${Number(order.total).toLocaleString('en-IN')}`
        : '';

    const bodyParts = [];
    if (itemCount > 0) bodyParts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
    if (total) bodyParts.push(total);
    const body = bodyParts.length
      ? `Your order is confirmed (${bodyParts.join(' · ')}).`
      : 'Your order is confirmed. Thank you for shopping with Elanters.';

    return await sendPushToCustomer(cid, {
      title: 'Order confirmed',
      body,
      data: {
        screen: 'order',
        orderId: id,
        id,
        type: 'order_confirmed',
      },
    });
  } catch (err) {
    console.warn('[push] notifyOrderConfirmed failed:', err?.message || err);
    return { sent: 0, error: err?.message || String(err) };
  }
}

module.exports = {
  sendPushToCustomer,
  notifyBookingEvent,
  notifyBookingConfirmed,
  notifyGardenerAssigned,
  notifyBookingCompleted,
  notifyBookingCanceled,
  notifyOrderConfirmed,
};
