const { potBand, repot, standalone, grassBands, GRASS_AREA_ORDER } = require("../config/gardenerSkuMap");

const HOME_VILLA_SLOT_TO_BACKEND = {
  "9-12": "9am-12pm",
  "12-15": "12pm-3pm",
  "15-18": "3pm-6pm",
};

function mapGrassSlotKeyToBackend(slotKey) {
  const h = parseInt(String(slotKey), 10);
  if (!Number.isFinite(h)) return "9am-12pm";
  if (h < 12) return "9am-12pm";
  if (h < 15) return "12pm-3pm";
  if (h < 18) return "3pm-6pm";
  return "6pm-9pm";
}

function homeVillaStartHour(slotKey) {
  if (slotKey === "12-15") return 12;
  if (slotKey === "15-18") return 15;
  return 9;
}

/**
 * Accepts PDP keys (`9-12`), `HH:MM`, or a single hour number (string).
 */
function normalizeHomeVillaSlot(slotKey) {
  const s = String(slotKey).trim();
  if (HOME_VILLA_SLOT_TO_BACKEND[s]) {
    return {
      timeSlot: HOME_VILLA_SLOT_TO_BACKEND[s],
      hour: homeVillaStartHour(s),
    };
  }
  const clock = s.match(/^(\d{1,2}):(\d{2})/);
  if (clock) {
    let hh = parseInt(clock[1], 10);
    if (/pm/i.test(s) && hh < 12) hh += 12;
    if (/am/i.test(s) && hh === 12) hh = 0;
    return { timeSlot: mapGrassSlotKeyToBackend(String(hh)), hour: hh };
  }
  const h = parseInt(s, 10);
  if (Number.isFinite(h)) {
    return { timeSlot: mapGrassSlotKeyToBackend(String(h)), hour: h };
  }
  return { timeSlot: "9am-12pm", hour: 9 };
}

function toLocalDateISO(serviceDateYmd, hour) {
  const [y, mo, d] = String(serviceDateYmd).split("-").map(Number);
  if (!y || !mo || !d) throw new Error("gardener.serviceDate must be YYYY-MM-DD");
  return new Date(y, mo - 1, d, hour, 0, 0, 0).toISOString();
}

function grassAreaIndex(areaBandId) {
  if (!areaBandId) return 0;
  const i = GRASS_AREA_ORDER.indexOf(String(areaBandId));
  return i >= 0 ? i : 0;
}

/**
 * Turn a compact `gardener` object from clients into items + scheduledDateTime + serviceType + description + notes.
 * @param {object} g
 * @returns {{ items: Array<{productId: string, quantity: number}>, scheduledDateTime: {date: string, timeSlot: string}, serviceType: string, description: string, notes?: string }}
 */
function expandGardenerBooking(g) {
  if (!g || typeof g !== "object") throw new Error("gardener payload is invalid");
  const flow = g.flow;
  const serviceDate = g.serviceDate;
  const slotKey = g.slotKey;
  if (!flow || !serviceDate || slotKey === undefined || slotKey === null || slotKey === "") {
    throw new Error("gardener.flow, gardener.serviceDate, and gardener.slotKey are required");
  }

  let items = [];
  let scheduledDateTime;
  const descriptionParts = [];
  let notes = g.notes && String(g.notes).trim() ? String(g.notes).trim() : "";

  if (flow === "home") {
    const h = g.home || {};
    const tier = h.potTierId;
    if (!tier) throw new Error("gardener.home.potTierId is required when flow is home");
    const visitId = potBand[tier];
    if (!visitId) throw new Error(`Unknown gardener.home.potTierId: ${tier}`);
    items.push({ productId: visitId, quantity: 1 });
    const rs = Math.max(0, Number(h.repotSmall) || 0);
    const rl = Math.max(0, Number(h.repotLarge) || 0);
    if (rs > 0) items.push({ productId: repot.upto12, quantity: rs });
    if (rl > 0) items.push({ productId: repot.above12, quantity: rl });
    const { timeSlot, hour } = normalizeHomeVillaSlot(slotKey);
    scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    descriptionParts.push(`Home gardener (${tier} pots band)`);
    if (h.fertilizerFromGardener) {
      notes = [notes, "Fertiliser: gardener may bring (as per use)"].filter(Boolean).join("\n");
    }
  } else if (flow === "villa") {
    items.push({ productId: standalone.villa, quantity: 1 });
    const { timeSlot, hour } = normalizeHomeVillaSlot(slotKey);
    scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    descriptionParts.push("Villa / independent house gardener visit");
  } else if (flow === "grass") {
    const grass = g.grass || {};
    const idx = grassAreaIndex(grass.areaBandId);
    const pid = grassBands[idx] || grassBands[0];
    items.push({ productId: pid, quantity: 1 });
    const clock = String(slotKey).match(/^(\d{1,2}):(\d{2})/);
    let hour = 9;
    if (clock) {
      hour = parseInt(clock[1], 10);
      const t = String(slotKey);
      if (/pm/i.test(t) && hour < 12) hour += 12;
      if (/am/i.test(t) && hour === 12) hour = 0;
    } else {
      const hourRaw = parseInt(String(slotKey), 10);
      hour = Number.isFinite(hourRaw) ? hourRaw : 9;
    }
    const timeSlot = mapGrassSlotKeyToBackend(String(hour));
    scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    descriptionParts.push("Grass cutting / lawn service");
  } else {
    throw new Error(`Unknown gardener.flow: ${flow} (use home | villa | grass)`);
  }

  return {
    items,
    scheduledDateTime,
    serviceType: "gardening",
    description: descriptionParts.join(" — "),
    ...(notes ? { notes } : {}),
  };
}

module.exports = { expandGardenerBooking };
