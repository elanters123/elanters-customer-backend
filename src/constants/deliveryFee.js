/** Plant-only orders: flat fee when merchandise subtotal is below the free-shipping threshold. */
const DELIVERY_FEE = 179;
/** Free shipping on plant-only orders at this subtotal and above (₹). */
const FREE_DELIVERY_THRESHOLD = 999;

/**
 * Delivery charges (customer app):
 * - Plant-only below ₹999 → ₹179
 * - Plant-only ₹999+ → free
 * - Plant + gardener / gardener-only → free (handled by not calling this on booking flows)
 */
function calcPlantOnlyDeliveryFee(plantSubtotal) {
  const sub = Number(plantSubtotal) || 0;
  if (sub <= 0) return 0;
  return sub < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : 0;
}

module.exports = {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  calcPlantOnlyDeliveryFee,
};
