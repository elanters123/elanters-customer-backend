// Watches CustomerOrder status updates and sends plant-order Expo pushes.

const CustomerOrder = require('../models/CustomerOrder');
const { notifyOrderStatus } = require('./pushNotificationService');
const logger = require('../utils/logger');

function startCustomerOrderPushWatcher() {
  try {
    const stream = CustomerOrder.watch(
      [{ $match: { operationType: { $in: ['update', 'replace', 'insert'] } } }],
      { fullDocument: 'updateLookup' }
    );

    stream.on('change', async (change) => {
      try {
        const doc = change.fullDocument;
        if (!doc?.customerId || !doc?.status) return;

        // Inserts are notified from confirmPayment (notifyOrderConfirmed).
        if (change.operationType === 'insert') return;

        const fields = change.updateDescription?.updatedFields || {};
        const statusChanged =
          change.operationType === 'replace' ||
          Object.prototype.hasOwnProperty.call(fields, 'status');
        if (!statusChanged) return;

        await notifyOrderStatus(doc.customerId, doc, doc.status);
      } catch (err) {
        logger.warn('Order push watcher change handler failed', 'PushWatcher', {
          message: err?.message || String(err),
        });
      }
    });

    stream.on('error', (err) => {
      logger.warn('Order push watcher stream error', 'PushWatcher', {
        message: err?.message || String(err),
      });
    });

    logger.info('Listening for plant order status pushes', 'PushWatcher');
  } catch (err) {
    logger.warn('Order push watcher failed to start', 'PushWatcher', {
      message: err?.message || String(err),
    });
  }
}

module.exports = { startCustomerOrderPushWatcher };
