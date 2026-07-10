const { potBand, repot, standalone, grassBands, GRASS_AREA_ORDER } = require("../config/gardenerSkuMap");

/** Slot stays bookable until this many hours before the window ends. */
const SLOT_BOOKING_CUTOFF_HOURS_BEFORE_END = 1;

const HOME_VILLA_SLOT_TO_BACKEND = {
  "9-12": "9am-12pm",
  "12-15": "12pm-3pm",
  "15-18": "3pm-6pm",
};

const HOME_VILLA_SLOT_END_HOUR = {
  "9-12": 12,
  "12-15": 15,
  "15-18": 18,
};

function slotWindowEndHourFromStart(startHour) {
  const h = Number(startHour);
  if (!Number.isFinite(h)) return 12;
  if (h < 12) return 12;
  if (h < 15) return 15;
  if (h < 18) return 18;
  return 21;
}

/**
 * A slot remains available until 1 hour before its end time.
 * @param {string} serviceDateYmd
 * @param {number} endHour local hour when the slot window ends
 * @param {number} [cutoffHoursBeforeEnd]
 */
function assertSlotBookableUntilCutoffBeforeEnd(
  serviceDateYmd,
  endHour,
  cutoffHoursBeforeEnd = SLOT_BOOKING_CUTOFF_HOURS_BEFORE_END,
) {
  const [y, mo, d] = String(serviceDateYmd).split("-").map(Number);
  if (!y || !mo || !d) throw new Error("gardener.serviceDate must be YYYY-MM-DD");
  const slotEnd = new Date(y, mo - 1, d, endHour, 0, 0, 0);
  const cutoff = slotEnd.getTime() - cutoffHoursBeforeEnd * 60 * 60 * 1000;
  if (Date.now() >= cutoff) {
    throw new Error(
      `This time slot can only be booked until ${cutoffHoursBeforeEnd} hour${
        cutoffHoursBeforeEnd === 1 ? "" : "s"
      } before it ends`,
    );
  }
}

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

function homeVillaEndHour(slotKey) {
  if (HOME_VILLA_SLOT_END_HOUR[slotKey] != null) return HOME_VILLA_SLOT_END_HOUR[slotKey];
  return slotWindowEndHourFromStart(homeVillaStartHour(slotKey));
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
      endHour: homeVillaEndHour(s),
    };
  }
  const clock = s.match(/^(\d{1,2}):(\d{2})/);
  if (clock) {
    let hh = parseInt(clock[1], 10);
    if (/pm/i.test(s) && hh < 12) hh += 12;
    if (/am/i.test(s) && hh === 12) hh = 0;
    return {
      timeSlot: mapGrassSlotKeyToBackend(String(hh)),
      hour: hh,
      endHour: slotWindowEndHourFromStart(hh),
    };
  }
  const h = parseInt(s, 10);
  if (Number.isFinite(h)) {
    return {
      timeSlot: mapGrassSlotKeyToBackend(String(h)),
      hour: h,
      endHour: slotWindowEndHourFromStart(h),
    };
  }
  return { timeSlot: "9am-12pm", hour: 9, endHour: 12 };
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

  if (Array.isArray(g.lineItems) && g.lineItems.length > 0) {
    for (const line of g.lineItems) {
      if (!line || !line.productId) {
        throw new Error("gardener.lineItems entries require productId and quantity");
      }
      const qty = Math.max(1, Number(line.quantity) || 1);
      items.push({ productId: String(line.productId), quantity: qty });
    }
  } else if (flow === "home") {
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
    descriptionParts.push(`Home gardener (${tier} pots band)`);
  } else if (flow === "villa") {
    const v = g.villa || {};
    const tier = v.potTierId;
    if (!tier) throw new Error("gardener.villa.potTierId is required when flow is villa");
    const visitId = potBand[tier];
    if (!visitId) throw new Error(`Unknown gardener.villa.potTierId: ${tier}`);
    items.push({ productId: visitId, quantity: 1 });
    const rs = Math.max(0, Number(v.repotSmall) || 0);
    const rl = Math.max(0, Number(v.repotLarge) || 0);
    if (rs > 0) items.push({ productId: repot.upto12, quantity: rs });
    if (rl > 0) items.push({ productId: repot.above12, quantity: rl });
    descriptionParts.push(`Villa gardener (${tier} pots band)`);
  } else if (flow === "grass") {
    const grass = g.grass || {};
    const idx = grassAreaIndex(grass.areaBandId);
    const pid = grassBands[idx] || grassBands[0];
    items.push({ productId: pid, quantity: 1 });
    descriptionParts.push("Grass cutting / lawn service");
  } else {
    throw new Error(`Unknown gardener.flow: ${flow} (use home | villa | grass)`);
  }

  if (flow === "home") {
    const h = g.home || {};
    const tier = h.potTierId || "—";
    const { timeSlot, hour, endHour } = normalizeHomeVillaSlot(slotKey);
    assertSlotBookableUntilCutoffBeforeEnd(serviceDate, endHour);
    scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    if (!descriptionParts.length) descriptionParts.push(`Home gardener (${tier} pots band)`);
    if (h.fertilizerFromGardener) {
      notes = [notes, "Fertiliser: gardener may bring (as per use)"].filter(Boolean).join("\n");
    }
  } else if (flow === "villa") {
    const v = g.villa || {};
    const tier = v.potTierId || "—";
    const { timeSlot, hour, endHour } = normalizeHomeVillaSlot(slotKey);
    assertSlotBookableUntilCutoffBeforeEnd(serviceDate, endHour);
    scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    if (!descriptionParts.length) descriptionParts.push(`Villa gardener (${tier} pots band)`);
    if (v.fertilizerFromGardener) {
      notes = [notes, "Fertiliser: gardener may bring (as per use)"].filter(Boolean).join("\n");
    }
  } else if (flow === "grass") {
    const clock = String(slotKey).match(/^(\d{1,2}):(\d{2})/);
    let hour = 9;
    if (HOME_VILLA_SLOT_TO_BACKEND[String(slotKey).trim()]) {
      const normalized = normalizeHomeVillaSlot(slotKey);
      hour = normalized.hour;
      assertSlotBookableUntilCutoffBeforeEnd(serviceDate, normalized.endHour);
      scheduledDateTime = {
        date: toLocalDateISO(serviceDate, hour),
        timeSlot: normalized.timeSlot,
      };
    } else {
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
      assertSlotBookableUntilCutoffBeforeEnd(serviceDate, slotWindowEndHourFromStart(hour));
      scheduledDateTime = { date: toLocalDateISO(serviceDate, hour), timeSlot };
    }
    if (!descriptionParts.length) descriptionParts.push("Grass cutting / lawn service");
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
