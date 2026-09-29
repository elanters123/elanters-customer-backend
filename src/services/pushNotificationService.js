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

function orderSummary(order) {
  const itemCount = Array.isArray(order?.items)
    ? order.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)
    : 0;
  const total =
    order?.total != null ? `₹${Number(order.total).toLocaleString('en-IN')}` : '';
  const parts = [];
  if (itemCount > 0) parts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
  if (total) parts.push(total);
  return parts.join(' · ');
}

/** Gardener Booking pushes */
const BOOKING_PUSH = {
  confirmed: {
    title: 'Booking confirmed',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `Your gardener visit is confirmed for ${when}.`
        : 'Your gardener visit is confirmed.';
    },
    type: 'booking_confirmed',
  },
  assigned: {
    title: 'Gardener assigned',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `A gardener has been assigned for your visit on ${when}.`
        : 'A gardener has been assigned to your booking.';
    },
    type: 'gardener_assigned',
  },
  completed: {
    title: 'Visit completed',
    body: () => 'Your gardener visit is done. Thank you for choosing Elanters.',
    type: 'visit_completed',
  },
  canceled: {
    title: 'Booking canceled',
    body: (booking) => {
      const when = formatWhen(booking);
      return when
        ? `Your gardener visit on ${when} has been canceled.`
        : 'Your gardener visit has been canceled.';
    },
    type: 'booking_canceled',
  },
};

/**
 * Plant CustomerOrder pushes
 * Confirm → Assigned (shipped) → Completed (delivered) → Canceled
 */
const ORDER_PUSH = {
  confirmed: {
    title: 'Order Confirmed',
    body: (order) => {
      const summary = orderSummary(order);
      return summary
        ? `Your order is confirmed (${summary}).`
        : 'Your order is confirmed. Thank you for shopping with Elanters.';
    },
    type: 'order_confirmed',
  },
  shipped: {
    title: 'Your order has been shipped',
    body: () => 'Your plant order is on the way.',
    type: 'order_shipped',
  },
  completed: {
    title: 'Order Delivered',
    body: () => 'Your order has been delivered. Thank you for choosing Elanters.',
    type: 'order_completed',
  },
  canceled: {
    title: 'Order Canceled',
    body: () => 'Your plant order has been canceled.',
    type: 'order_canceled',
  },
};

/** Map CustomerOrder.status → push kind (only the 4 customer-facing stages) */
const ORDER_STATUS_TO_PUSH_KIND = {
  confirmed: 'confirmed',
  shipped: 'shipped',
  delivered: 'completed',
  cancelled: 'canceled',
  canceled: 'canceled',
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
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function alreadyNotifiedBooking(bookingId, kind) {
  if (!bookingId || !kind) return true;
  const row = await BookingPushReceipt.findOne({ bookingId, kind }).lean();
  return Boolean(row);
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

async function alreadyNotifiedOrder(orderId, kind) {
  if (!orderId || !kind) return true;
  const row = await OrderPushReceipt.findOne({ orderId, kind }).lean();
  return Boolean(row);
}

function pushDelivered(result) {
  if (!result || result.error) return false;
  if (!result.sent) return false;
  const tickets = Array.isArray(result.tickets) ? result.tickets : [];
  if (!tickets.length) return true;
  return tickets.some((t) => t?.status === 'ok');
}

async function notifyBookingEvent(customerId, booking, kind) {
  const tpl = BOOKING_PUSH[kind];
  if (!tpl) return { sent: 0 };
  const id = bookingIdOf(booking);
  try {
    if (await alreadyNotifiedBooking(id, kind)) {
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
        type: tpl.type || kind,
        kind,
      },
    });

    if (pushDelivered(result)) {
      await claimBookingPushReceipt(id, kind);
    } else {
      console.warn(
        `[push] booking ${id} kind=${kind} not delivered (sent=${result?.sent || 0}) — will retry on next assign/update`,
      );
    }
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
 * Plant order lifecycle push.
 * @param {string|import('mongoose').Types.ObjectId} customerId
 * @param {object} order
 * @param {keyof typeof ORDER_PUSH} kind
 */
async function notifyOrderEvent(customerId, order, kind) {
  const tpl = ORDER_PUSH[kind];
  if (!tpl) return { sent: 0 };
  const id = orderIdOf(order);
  const cid = customerId || order?.customerId;
  try {
    if (await alreadyNotifiedOrder(id, kind)) {
      console.log(`[push] order ${id} kind=${kind} already notified — skip`);
      return { sent: 0, skipped: true };
    }

    const result = await sendPushToCustomer(cid, {
      title: tpl.title,
      body: tpl.body(order),
      data: {
        screen: 'order',
        orderId: id,
        id,
        type: tpl.type || `order_${kind}`,
        kind,
      },
    });

    if (pushDelivered(result)) {
      await claimOrderPushReceipt(id, kind);
    } else {
      console.warn(
        `[push] order ${id} kind=${kind} not delivered (sent=${result?.sent || 0}) — will retry on next status update`,
      );
    }
    return result;
  } catch (err) {
    console.warn(`[push] notifyOrderEvent(${kind}) failed:`, err?.message || err);
    return { sent: 0, error: err?.message || String(err) };
  }
}

async function notifyOrderConfirmed(customerId, order) {
  return notifyOrderEvent(customerId, order, 'confirmed');
}

async function notifyOrderStatus(customerId, order, status) {
  const kind = ORDER_STATUS_TO_PUSH_KIND[String(status || '').toLowerCase()];
  if (!kind) return { sent: 0, skipped: true };
  return notifyOrderEvent(customerId, order, kind);
}

module.exports = {
  sendPushToCustomer,
  notifyBookingEvent,
  notifyBookingConfirmed,
  notifyGardenerAssigned,
  notifyBookingCompleted,
  notifyBookingCanceled,
  notifyOrderConfirmed,
  notifyOrderEvent,
  notifyOrderStatus,
  ORDER_STATUS_TO_PUSH_KIND,
  ORDER_PUSH,
  BOOKING_PUSH,
};
