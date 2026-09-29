// Watches Booking updates from any writer (admin panel, partner app, etc.)
// and sends customer Expo pushes when a gardener is assigned / visit completes / canceled.
// Also mirrors plantation Booking updates onto linked mobile plant CustomerOrders.

const Booking = require('../models/Booking');
const CustomerOrder = require('../models/CustomerOrder');
const {
  notifyGardenerAssigned,
  notifyBookingCompleted,
  notifyBookingCanceled,
} = require('./pushNotificationService');
const { NOTES_PREFIX } = require('./customerOrderBookingSync');
const logger = require('../utils/logger');

function gardenerIdOf(doc) {
  const ref = doc?.assignee?.gardenerRef;
  if (!ref) return '';
  return String(ref._id || ref);
}

function assigneeTouched(updatedFields = {}) {
  return Object.keys(updatedFields).some(
    (k) => k === 'assignee' || k.startsWith('assignee.')
  );
}

function mobilePlantOrderIdFromNotes(notes) {
  const raw = String(notes || '');
  if (!raw.startsWith(NOTES_PREFIX)) return null;
  const id = raw.slice(NOTES_PREFIX.length).trim();
  return id || null;
}

/**
 * Keep CustomerOrder fulfillment status in sync with the Admin/Partner Booking
 * so plant push lifecycle can fire (shipped / completed / canceled).
 */
async function syncLinkedPlantCustomerOrder(booking, { shipped, delivered, canceled } = {}) {
  const orderId = mobilePlantOrderIdFromNotes(booking?.notes);
  if (!orderId) return;

  let nextStatus = null;
  if (canceled) nextStatus = 'cancelled';
  else if (delivered) nextStatus = 'delivered';
  else if (shipped) nextStatus = 'shipped';
  if (!nextStatus) return;

  try {
    const updated = await CustomerOrder.findOneAndUpdate(
      {
        _id: orderId,
        status: { $nin: ['delivered', 'cancelled', 'refunded'] },
      },
      { $set: { status: nextStatus } },
      { new: true }
    );
    if (updated) {
      logger.info('Synced plant CustomerOrder status from Booking', 'PushWatcher', {
        orderId,
        bookingId: String(booking._id),
        status: nextStatus,
      });
    }
  } catch (err) {
    logger.warn('Failed syncing plant CustomerOrder from Booking', 'PushWatcher', {
      orderId,
      message: err?.message || String(err),
    });
  }
}

function startBookingPushWatcher() {
  try {
    const stream = Booking.watch(
      [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
      { fullDocument: 'updateLookup' }
    );

    stream.on('change', async (change) => {
      try {
        const doc = change.fullDocument;
        if (!doc?.customer?.id) return;

        const fields = change.updateDescription?.updatedFields || {};
        const statusChanged = Object.prototype.hasOwnProperty.call(fields, 'status');
        const gardenerPresent = Boolean(gardenerIdOf(doc));
        const isMobilePlant = Boolean(mobilePlantOrderIdFromNotes(doc.notes));

        // Plantation Bookings mirrored from mobile plant orders use plant push copy,
        // not gardener visit copy.
        if (isMobilePlant) {
          if (assigneeTouched(fields) && gardenerPresent) {
            await syncLinkedPlantCustomerOrder(doc, { shipped: true });
            return;
          }
          if (statusChanged && doc.status === 'pending' && gardenerPresent) {
            await syncLinkedPlantCustomerOrder(doc, { shipped: true });
            return;
          }
          if (statusChanged && doc.status === 'completed') {
            await syncLinkedPlantCustomerOrder(doc, { delivered: true });
            return;
          }
          if (statusChanged && doc.status === 'canceled') {
            await syncLinkedPlantCustomerOrder(doc, { canceled: true });
            return;
          }
          return;
        }

        if (assigneeTouched(fields) && gardenerPresent) {
          await notifyGardenerAssigned(doc.customer.id, doc);
          return;
        }

        if (statusChanged && doc.status === 'pending' && gardenerPresent) {
          await notifyGardenerAssigned(doc.customer.id, doc);
          return;
        }

        if (statusChanged && doc.status === 'completed') {
          await notifyBookingCompleted(doc.customer.id, doc);
          return;
        }

        if (statusChanged && doc.status === 'canceled') {
          await notifyBookingCanceled(doc.customer.id, doc);
        }
      } catch (err) {
        logger.warn('Push watcher change handler failed', 'PushWatcher', {
          message: err?.message || String(err),
        });
      }
    });

    stream.on('error', (err) => {
      logger.warn('Push watcher stream error', 'PushWatcher', {
        message: err?.message || String(err),
      });
    });

    logger.info('Listening for booking assign/complete/cancel', 'PushWatcher');
  } catch (err) {
    logger.warn('Push watcher failed to start', 'PushWatcher', {
      message: err?.message || String(err),
    });
  }
}

module.exports = { startBookingPushWatcher };
