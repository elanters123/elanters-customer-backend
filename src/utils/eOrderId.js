// Human-readable booking reference for Admin + customer apps.
// Format: <sourceLetter><6 digits>  e.g. A482917, I103385, W774012, M551209
//   A = Android, I = iOS, W = Web, M = Manual (admin / ops)

const SOURCE_LETTER = {
  android: 'A',
  ios: 'I',
  web: 'W',
  manual: 'M',
  admin: 'M',
  a: 'A',
  i: 'I',
  w: 'W',
  m: 'M',
};

function normalizeEOrderSource(source) {
  const raw = String(source || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'M';
  if (SOURCE_LETTER[raw]) return SOURCE_LETTER[raw];
  if (raw === 'iphone' || raw === 'ipad') return 'I';
  if (raw.startsWith('android')) return 'A';
  if (raw.startsWith('ios')) return 'I';
  if (raw.startsWith('web')) return 'W';
  if (raw.startsWith('manual') || raw.startsWith('admin')) return 'M';
  // Already a single letter?
  const letter = raw.charAt(0).toUpperCase();
  if (letter === 'A' || letter === 'I' || letter === 'W' || letter === 'M') return letter;
  return 'M';
}

function looksLikeGeneratedEOrderId(value) {
  return /^[AIWM]\d{6}$/i.test(String(value || '').trim());
}

function isPlaceholderEOrderId(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (/^elanters$/i.test(v)) return true;
  // Legacy: Razorpay order ids were stored in eOrderId
  if (/^order_/i.test(v)) return true;
  return false;
}

function randomSixDigits() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Allocate a unique eOrderId for a Booking collection.
 * @param {import('mongoose').Model} BookingModel
 * @param {string} [source] android | ios | web | manual | A|I|W|M
 */
async function allocateEOrderId(BookingModel, source = 'M') {
  const letter = normalizeEOrderSource(source);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = `${letter}${randomSixDigits()}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await BookingModel.exists({ eOrderId: code });
    if (!exists) return code;
  }
  // Extremely unlikely fallback — still letter + 6 digits from time
  return `${letter}${String(Date.now()).slice(-6)}`;
}

/**
 * Resolve eOrderId for a new booking: keep a good existing code, otherwise allocate.
 */
async function resolveEOrderIdForCreate(BookingModel, { eOrderId, clientPlatform, channel, source } = {}) {
  const incoming = eOrderId != null ? String(eOrderId).trim() : '';
  if (incoming && !isPlaceholderEOrderId(incoming) && looksLikeGeneratedEOrderId(incoming)) {
    return incoming.toUpperCase();
  }
  if (incoming && !isPlaceholderEOrderId(incoming) && !/^order_/i.test(incoming)) {
    // Preserve intentional custom ids (e.g. email imports) when not placeholder
    const clash = await BookingModel.exists({ eOrderId: incoming });
    if (!clash) return incoming;
  }
  return allocateEOrderId(
    BookingModel,
    clientPlatform || channel || source || 'M',
  );
}

module.exports = {
  normalizeEOrderSource,
  looksLikeGeneratedEOrderId,
  isPlaceholderEOrderId,
  allocateEOrderId,
  resolveEOrderIdForCreate,
};
