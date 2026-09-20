// Watches Booking updates from any writer (admin panel, partner app, etc.)
// and sends customer Expo pushes when a gardener is assigned / visit completes / canceled.

const Booking = require('../models/Booking');
const {
  notifyGardenerAssigned,
  notifyBookingCompleted,
  notifyBookingCanceled,
} = require('./pushNotificationService');
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
