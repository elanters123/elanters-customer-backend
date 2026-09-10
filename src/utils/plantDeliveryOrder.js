/** Plant-only (no gardener line) → plantation + shipping; otherwise gardening + free ship. */

const {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  calcPlantOnlyDeliveryFee,
} = require('../constants/deliveryFee');

const GARDENER_LINE_RE =
  /gardener|repotting|grass\s*cutting|deweeding|lawn|villa\s*visit|home\s*gardener|professional\s*home\s*gardener/i;

/**
 * True if any line item looks like a gardener / visit service (not plant merchandise).
 * Checks catalog flags, names, and known hire-gardener product ids when present.
 */
function materialsIncludeGardener(materials = [], gardenerProductIds = []) {
  const idSet = new Set((gardenerProductIds || []).map((id) => String(id)));
  return (materials || []).some((m) => {
    if (!m) return false;
    if (m.isCatalogService === true) return true;
    if (m.isAdHoc === false && GARDENER_LINE_RE.test(String(m.name || m.title || ''))) {
      return true;
    }
    const name = String(m.name || m.title || '');
    if (GARDENER_LINE_RE.test(name)) return true;
    const pid = m.id || m.productId || m._id;
    if (pid && idSet.has(String(pid))) return true;
    return false;
  });
}

function resolveBookingServiceType(materials, opts = {}) {
  if (opts.forceGardener || materialsIncludeGardener(materials, opts.gardenerProductIds)) {
    return 'gardening';
  }
  return 'plantation';
}

/**
 * For plantation (plant-only): add delivery fee onto merchandise subtotal.
 * For gardening: no delivery fee.
 */
function applyPlantDeliveryCharges(merchandiseSubtotal, serviceType) {
  const sub = Math.max(0, Number(merchandiseSubtotal) || 0);
  if (String(serviceType).toLowerCase() !== 'plantation') {
    return { deliveryFee: 0, total: sub };
  }
  const deliveryFee = calcPlantOnlyDeliveryFee(sub);
  return { deliveryFee, total: sub + deliveryFee };
}

module.exports = {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  GARDENER_LINE_RE,
  materialsIncludeGardener,
  resolveBookingServiceType,
  applyPlantDeliveryCharges,
  calcPlantOnlyDeliveryFee,
};
