/** Validate optional booking photo (base64 data URL), same rules as admin order create. */

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * @param {unknown} image
 * @returns {string|undefined} trimmed data URL
 */
function validateBookingImage(image) {
  if (image === undefined || image === null || image === "") return undefined;
  const s = String(image).trim();
  if (!s) return undefined;
  if (!s.startsWith("data:image/")) {
    throw new Error("Invalid image format. Must be a base64 data URL (data:image/...).");
  }
  const comma = s.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid image format. Missing base64 payload.");
  }
  const base64Data = s.slice(comma + 1);
  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    throw new Error("Invalid image format. Empty image data.");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("Image size exceeds 3MB limit.");
  }
  return s;
}

module.exports = { validateBookingImage, MAX_BOOKING_IMAGE_BYTES: MAX_BYTES };
