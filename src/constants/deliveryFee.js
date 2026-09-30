/** Plant-only orders: shipping is free. Minimum merchandise subtotal to place a plant-only order. */
const DELIVERY_FEE = 0;
/** Kept for backwards compatibility — shipping is always free for plant-only. */
const FREE_DELIVERY_THRESHOLD = 0;
/** Minimum plant merchandise subtotal (₹) required to place a plant-only order. */
const MIN_PLANT_ORDER_SUBTOTAL = 799;

/**
 * Delivery charges (customer app):
 * - Plant-only → always free
 * - Plant + gardener / gardener-only → free (callers skip or get 0)
 */
function calcPlantOnlyDeliveryFee(_plantSubtotal) {
  return 0;
}

function assertMinPlantOrderSubtotal(plantSubtotal) {
  const sub = Number(plantSubtotal) || 0;
  if (sub < MIN_PLANT_ORDER_SUBTOTAL) {
    const err = new Error(
      `Minimum plant order value is ₹${MIN_PLANT_ORDER_SUBTOTAL}. Add ₹${Math.max(
        0,
        Math.ceil(MIN_PLANT_ORDER_SUBTOTAL - sub),
      )} more in plants to continue.`,
    );
    err.status = 400;
    err.code = 'MIN_PLANT_ORDER';
    throw err;
  }
}

module.exports = {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  MIN_PLANT_ORDER_SUBTOTAL,
  calcPlantOnlyDeliveryFee,
  assertMinPlantOrderSubtotal,
};
