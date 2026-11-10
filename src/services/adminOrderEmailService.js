/**
 * Admin email when a customer places an order from the website or app.
 * Builds a full HTML summary from Booking (+ linked CustomerOrder / Item) and
 * sends once per booking (AdminOrderEmailReceipt).
 */
const nodemailer = require('nodemailer');
const Booking = require('../models/Booking');
const CustomerOrder = require('../models/CustomerOrder');
const Item = require('../models/Item');
const AdminOrderEmailReceipt = require('../models/AdminOrderEmailReceipt');
const { attachResolvedImages } = require('./productImageService');
const { potBand, repot } = require('../config/gardenerSkuMap');
const logger = require('../utils/logger');

/** Must match customerOrderBookingSync.NOTES_PREFIX */
const NOTES_PREFIX = 'mobile-plant-order:';
const DEFAULT_ADMIN_TO = 'elantersupdate@gmail.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toFixed(2)}`;
}

function formatDateTimeIST(date) {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

function formatDateIST(date) {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

function paymentModeLabel(method, paymentStatus) {
  const m = String(method || '').toLowerCase();
  if (m === 'cod') return 'COD';
  if (m === 'online' || m === 'upi' || m === 'card' || m === 'netbanking' || m === 'wallet') {
    return 'Online';
  }
  if (String(paymentStatus || '').toLowerCase() === 'paid') return 'Online';
  return m ? m.toUpperCase() : '—';
}

function sourceLabel(eOrderId) {
  const letter = String(eOrderId || '').charAt(0).toUpperCase();
  if (letter === 'A') return 'Android app';
  if (letter === 'I') return 'iOS app';
  if (letter === 'W') return 'Web';
  if (letter === 'M') return 'Manual / admin';
  return 'Unknown';
}

function potBandLabelFromDescription(description) {
  const m = String(description || '').match(/\(([^)]*pots?\s*band)\)/i);
  if (m) return m[1];
  const m2 = String(description || '').match(/\b(\d+\s*-\s*\d+)\s*pots?\b/i);
  if (m2) return `${m2[1]} pots`;
  return null;
}

function fertiliserFromNotes(notes) {
  const text = String(notes || '');
  if (/fertilis?er/i.test(text)) {
    const line = text
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => /fertilis?er/i.test(l));
    return line || 'Yes (see notes)';
  }
  return 'No';
}

function createTransporter() {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!host || !user || !pass) {
    const err = new Error(
      'EMAIL_HOST, EMAIL_USER and EMAIL_PASS must be set to send admin order emails',
    );
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const port = Number(process.env.EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function claimReceipt(bookingId, eOrderId) {
  try {
    await AdminOrderEmailReceipt.create({
      bookingId,
      eOrderId: eOrderId || null,
    });
    return { claimed: true };
  } catch (err) {
    if (err && (err.code === 11000 || err.code === '11000')) {
      return { claimed: false };
    }
    throw err;
  }
}

async function releaseReceipt(bookingId) {
  try {
    await AdminOrderEmailReceipt.deleteOne({ bookingId });
  } catch (err) {
    logger.warn('Failed releasing admin order email receipt', 'AdminEmail', {
      bookingId: String(bookingId),
      message: err?.message || String(err),
    });
  }
}

/**
 * Load booking + linked plant order + catalog images into a view model.
 */
async function buildOrderEmailData(bookingInput) {
  const bookingId = bookingInput?._id || bookingInput;
  let booking =
    bookingInput && bookingInput.customer && bookingInput.materials
      ? typeof bookingInput.toObject === 'function'
        ? bookingInput.toObject()
        : bookingInput
      : null;

  if (!booking?._id) {
    booking = await Booking.findById(bookingId).lean();
  } else if (!booking.eOrderId || !booking.payment) {
    booking = await Booking.findById(booking._id).lean();
  }

  if (!booking?._id) {
    throw new Error('Booking not found for admin order email');
  }

  let customerOrder = null;
  const notes = String(booking.notes || '');
  if (notes.startsWith(NOTES_PREFIX)) {
    const orderId = notes.slice(NOTES_PREFIX.length).trim();
    if (orderId) {
      customerOrder = await CustomerOrder.findById(orderId).lean();
    }
  }

  const materialIds = (booking.materials || [])
    .map((m) => m?.id)
    .filter(Boolean)
    .map((id) => String(id));

  const uniqueIds = [...new Set(materialIds)];
  let itemsById = new Map();
  if (uniqueIds.length) {
    const catalogItems = await Item.find({ _id: { $in: uniqueIds } })
      .select('name price images imageIds unit')
      .lean();
    const withImages = await attachResolvedImages(catalogItems, null);
    itemsById = new Map(withImages.map((it) => [String(it._id), it]));
  }

  const orderItemsByProduct = new Map();
  if (customerOrder?.items?.length) {
    for (const line of customerOrder.items) {
      const key = String(line.productId || '');
      if (key) orderItemsByProduct.set(key, line);
    }
  }

  const potBandIds = new Set(Object.values(potBand).map(String));
  const repotUpto = String(repot.upto12);
  const repotAbove = String(repot.above12);

  const lines = (booking.materials || []).map((m) => {
    const id = m?.id ? String(m.id) : '';
    const catalog = id ? itemsById.get(id) : null;
    const plantLine = id ? orderItemsByProduct.get(id) : null;
    const image =
      (plantLine?.image && String(plantLine.image).trim()) ||
      (Array.isArray(catalog?.images) && catalog.images[0]) ||
      '';
    const variantLabel = plantLine?.variantLabel || '';
    let kind = 'product';
    if (id && potBandIds.has(id)) kind = 'pot_band';
    if (id === repotUpto) kind = 'repot_upto12';
    if (id === repotAbove) kind = 'repot_above12';

    const qty = Number(m.quantity) || 1;
    const price = Number(m.price) || 0;
    return {
      id,
      name: m.name || catalog?.name || 'Item',
      image,
      quantity: qty,
      price,
      lineTotal: qty * price,
      unit: m.unit || catalog?.unit || 'pcs',
      variantLabel,
      kind,
    };
  });

  const materialsSubtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const subtotal =
    customerOrder?.subtotal != null ? Number(customerOrder.subtotal) : materialsSubtotal;
  const discount =
    customerOrder?.discount != null
      ? Number(customerOrder.discount)
      : Number(booking.coupon?.discountAmount) || 0;
  const deliveryFee =
    customerOrder?.deliveryFee != null ? Number(customerOrder.deliveryFee) : 0;
  const tax = 0;
  const total =
    booking.payment?.totalAmount != null
      ? Number(booking.payment.totalAmount)
      : customerOrder?.total != null
        ? Number(customerOrder.total)
        : materialsSubtotal - discount + deliveryFee;

  const prepaid = Number(booking.payment?.prePaidAmount) || 0;
  const remainingCod = Math.max(0, total - prepaid);
  const method =
    customerOrder?.paymentMethod ||
    booking.payment?.method ||
    (prepaid >= total && total > 0 ? 'online' : '');

  const isGardening = String(booking.serviceType || '').toLowerCase() === 'gardening';
  const potBandLabel = potBandLabelFromDescription(booking.description);
  const repotSmall = lines
    .filter((l) => l.kind === 'repot_upto12')
    .reduce((n, l) => n + l.quantity, 0);
  const repotLarge = lines
    .filter((l) => l.kind === 'repot_above12')
    .reduce((n, l) => n + l.quantity, 0);

  const addressParts = [
    booking.location?.address,
    booking.location?.city,
    booking.location?.state,
    booking.location?.postalCode,
  ].filter(Boolean);

  // Options: notes minus mobile-plant-order marker and fertiliser line (shown separately)
  const optionLines = notes
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith(NOTES_PREFIX))
    .filter((l) => !/fertilis?er/i.test(l));

  return {
    bookingId: String(booking._id),
    eOrderId: booking.eOrderId || String(booking._id).slice(-8).toUpperCase(),
    source: sourceLabel(booking.eOrderId),
    placedAt: booking.history?.createdAt || booking.createdAt || booking.bookingDate,
    serviceType: booking.serviceType || '',
    description: booking.description || '',
    customer: {
      name: booking.customer?.name || '—',
      phone: booking.customer?.phone || '—',
      email: booking.customer?.email || '—',
      address: addressParts.join(', ') || '—',
    },
    payment: {
      mode: paymentModeLabel(method, booking.payment?.status),
      method: method || '—',
      status: booking.payment?.status || '—',
      prepaid,
      remainingCod,
      total,
    },
    lines,
    options: optionLines,
    couponCode: booking.coupon?.code || customerOrder?.couponCode || null,
    totals: {
      subtotal,
      discount,
      deliveryFee,
      tax,
      total,
    },
    gardener: isGardening
      ? {
          bookingDate: booking.scheduledDateTime?.date,
          timeSlot: booking.scheduledDateTime?.timeSlot || '—',
          potBand: potBandLabel || '—',
          repotSmall,
          repotLarge,
          fertiliser: fertiliserFromNotes(notes),
        }
      : null,
  };
}

function buildHtml(data) {
  const itemRows = data.lines
    .map((line) => {
      const imgCell = line.image
        ? `<img src="${escapeHtml(line.image)}" alt="" width="56" height="56" style="display:block;border-radius:6px;object-fit:cover;border:1px solid #e5e7eb;" />`
        : `<div style="width:56px;height:56px;background:#f3f4f6;border-radius:6px;border:1px solid #e5e7eb;"></div>`;
      const variant = line.variantLabel
        ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${escapeHtml(line.variantLabel)}</div>`
        : '';
      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${imgCell}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-weight:600;color:#111827;">${escapeHtml(line.name)}</div>
            ${variant}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;">${escapeHtml(line.quantity)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;">${escapeHtml(formatInr(line.price))}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;font-weight:600;">${escapeHtml(formatInr(line.lineTotal))}</td>
        </tr>`;
    })
    .join('');

  const optionsBlock =
    data.options.length > 0
      ? `
      <tr>
        <td style="padding:16px 24px;">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Selected options & notes</div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;color:#374151;font-size:14px;line-height:1.5;">
            ${data.options.map((o) => `<div>${escapeHtml(o)}</div>`).join('')}
          </div>
        </td>
      </tr>`
      : '';

  const gardenerBlock = data.gardener
    ? `
      <tr>
        <td style="padding:16px 24px;">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Gardener booking details</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;width:40%;color:#6b7280;font-size:13px;">Booking date</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(formatDateIST(data.gardener.bookingDate))}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">Time slot</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(data.gardener.timeSlot)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">Number of pots</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(data.gardener.potBand)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">Repotting (upto 12")</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(data.gardener.repotSmall)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">Repotting (above 12")</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(data.gardener.repotLarge)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#f9fafb;color:#6b7280;font-size:13px;">Fertiliser</td>
              <td style="padding:10px 14px;font-size:14px;color:#111827;">${escapeHtml(data.gardener.fertiliser)}</td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const discountLabel = data.couponCode
    ? `Discount (${escapeHtml(data.couponCode)})`
    : 'Discount';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f766e;padding:20px 24px;">
              <div style="color:#ffffff;font-size:20px;font-weight:700;">Elanters</div>
              <div style="color:#ccfbf1;font-size:13px;margin-top:4px;">New order notification</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <div style="font-size:18px;font-weight:700;color:#111827;">Order #${escapeHtml(data.eOrderId)}</div>
              <div style="color:#6b7280;font-size:13px;margin-top:4px;">
                ${escapeHtml(formatDateTimeIST(data.placedAt))} · ${escapeHtml(data.source)} · ${escapeHtml(data.serviceType || 'order')}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;width:50%;border-right:1px solid #e5e7eb;vertical-align:top;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;font-weight:700;">Payment</div>
                    <div style="margin-top:6px;font-size:14px;color:#111827;"><strong>${escapeHtml(data.payment.mode)}</strong> (${escapeHtml(data.payment.status)})</div>
                    <div style="margin-top:4px;font-size:13px;color:#374151;">Prepaid: ${escapeHtml(formatInr(data.payment.prepaid))}</div>
                    <div style="font-size:13px;color:#374151;">Remaining COD: ${escapeHtml(formatInr(data.payment.remainingCod))}</div>
                  </td>
                  <td style="padding:12px 14px;width:50%;vertical-align:top;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;font-weight:700;">Customer</div>
                    <div style="margin-top:6px;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(data.customer.name)}</div>
                    <div style="font-size:13px;color:#374151;">${escapeHtml(data.customer.phone)}</div>
                    <div style="font-size:13px;color:#374151;">${escapeHtml(data.customer.email)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 16px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;font-weight:700;margin-bottom:6px;">Delivery address</div>
              <div style="font-size:14px;color:#111827;line-height:1.45;">${escapeHtml(data.customer.address)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px;">
              <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Items</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Img</th>
                  <th style="padding:10px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Product / service</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Qty</th>
                  <th style="padding:10px 8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Price</th>
                  <th style="padding:10px 8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Total</th>
                </tr>
                ${itemRows || '<tr><td colspan="5" style="padding:16px;color:#6b7280;">No line items</td></tr>'}
              </table>
            </td>
          </tr>
          ${optionsBlock}
          ${gardenerBlock}
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:280px;margin-left:auto;">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Subtotal</td>
                  <td style="padding:6px 0;text-align:right;font-size:14px;color:#111827;">${escapeHtml(formatInr(data.totals.subtotal))}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">${discountLabel}</td>
                  <td style="padding:6px 0;text-align:right;font-size:14px;color:#111827;">-${escapeHtml(formatInr(data.totals.discount))}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Delivery</td>
                  <td style="padding:6px 0;text-align:right;font-size:14px;color:#111827;">${escapeHtml(formatInr(data.totals.deliveryFee))}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Tax</td>
                  <td style="padding:6px 0;text-align:right;font-size:14px;color:#111827;">${escapeHtml(formatInr(data.totals.tax))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0 0;border-top:1px solid #e5e7eb;font-weight:700;font-size:15px;color:#111827;">Final total</td>
                  <td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;font-size:15px;color:#0f766e;">${escapeHtml(formatInr(data.totals.total))}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center;">
              Automated message from Elanters order system · Booking ID ${escapeHtml(data.bookingId)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(data) {
  const lines = [
    `New order: Elanters #${data.eOrderId}`,
    `Placed: ${formatDateTimeIST(data.placedAt)} (${data.source})`,
    `Service: ${data.serviceType}`,
    '',
    `Customer: ${data.customer.name}`,
    `Phone: ${data.customer.phone}`,
    `Email: ${data.customer.email}`,
    `Address: ${data.customer.address}`,
    '',
    `Payment: ${data.payment.mode} (${data.payment.status})`,
    `Prepaid: ${formatInr(data.payment.prepaid)}`,
    `Remaining COD: ${formatInr(data.payment.remainingCod)}`,
    '',
    'Items:',
    ...data.lines.map(
      (l) =>
        `- ${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} x${l.quantity} @ ${formatInr(l.price)} = ${formatInr(l.lineTotal)}`,
    ),
  ];
  if (data.options.length) {
    lines.push('', 'Options / notes:', ...data.options.map((o) => `- ${o}`));
  }
  if (data.gardener) {
    lines.push(
      '',
      'Gardener booking:',
      `Date: ${formatDateIST(data.gardener.bookingDate)}`,
      `Slot: ${data.gardener.timeSlot}`,
      `Pots: ${data.gardener.potBand}`,
      `Repot upto 12": ${data.gardener.repotSmall}`,
      `Repot above 12": ${data.gardener.repotLarge}`,
      `Fertiliser: ${data.gardener.fertiliser}`,
    );
  }
  lines.push(
    '',
    `Subtotal: ${formatInr(data.totals.subtotal)}`,
    `Discount: ${formatInr(data.totals.discount)}`,
    `Delivery: ${formatInr(data.totals.deliveryFee)}`,
    `Tax: ${formatInr(data.totals.tax)}`,
    `Total: ${formatInr(data.totals.total)}`,
  );
  return lines.join('\n');
}

/**
 * Send admin new-order email for a Booking (id or document).
 * Safe to call with void — never throws to the caller path after logging.
 */
async function notifyAdminNewOrder(bookingOrId) {
  const to = (process.env.ADMIN_ORDER_NOTIFY_EMAIL || DEFAULT_ADMIN_TO).trim();
  if (!to) {
    logger.warn('Admin order email skipped — no recipient', 'AdminEmail');
    return { sent: false, reason: 'no_recipient' };
  }

  let bookingId = null;
  try {
    const data = await buildOrderEmailData(bookingOrId);
    bookingId = data.bookingId;

    const { claimed } = await claimReceipt(bookingId, data.eOrderId);
    if (!claimed) {
      logger.info('Admin order email already sent — skip', 'AdminEmail', {
        bookingId,
        eOrderId: data.eOrderId,
      });
      return { sent: false, skipped: true };
    }

    const transporter = createTransporter();
    const subject = `You have got a new order from your website: Elanters #${data.eOrderId}`;
    const html = buildHtml(data);
    const text = buildText(data);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
      text,
    });

    logger.info('Admin order email sent', 'AdminEmail', {
      bookingId,
      eOrderId: data.eOrderId,
      to,
      messageId: info?.messageId,
    });
    return { sent: true, messageId: info?.messageId, eOrderId: data.eOrderId };
  } catch (err) {
    if (bookingId) {
      await releaseReceipt(bookingId);
    }
    logger.error('Admin order email failed', 'AdminEmail', {
      bookingId,
      message: err?.message || String(err),
      code: err?.code,
    });
    return { sent: false, error: err?.message || String(err) };
  }
}

module.exports = {
  notifyAdminNewOrder,
  buildOrderEmailData,
  buildHtml,
  buildText,
};
