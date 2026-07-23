// Format a Date (or ISO string) to a friendly "Wed, 25 Dec 2026" display.
const formatDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const formatRupees = (paise) => {
  const rupees = (paise ?? 0) / 100;
  return `₹${rupees.toLocaleString('en-IN')}`;
};

export const bookingConfirmationGuestTemplate = ({
  guestName,
  bookingId,
  propertyTitle,
  propertyAddress,
  propertyCity,
  roomName,
  checkIn,
  checkOut,
  nights,
  numGuests,
  unitsBooked,
  totalAmountInPaise,
  ownerContactPhone,
  ownerContactEmail,
  bookingUrl,
}) => {
  const safeName = guestName || 'there';
  const subject = `Booking confirmed — ${propertyTitle}`;

  const contactLines = [];
  if (ownerContactPhone) contactLines.push(`Phone: ${ownerContactPhone}`);
  if (ownerContactEmail) contactLines.push(`Email: ${ownerContactEmail}`);
  const contactBlock = contactLines.length
    ? `\nHost contact (for questions before your stay):\n${contactLines.join('\n')}\n`
    : '';

  const text = [
    `Hi ${safeName},`,
    '',
    `Your booking is confirmed! Here are the details:`,
    '',
    `Booking ID: ${bookingId}`,
    `Property:   ${propertyTitle}`,
    `Room:       ${roomName}${unitsBooked > 1 ? ` × ${unitsBooked}` : ''}`,
    `Location:   ${propertyCity}`,
    `Address:    ${propertyAddress || '—'}`,
    ``,
    `Check-in:   ${formatDate(checkIn)}`,
    `Check-out:  ${formatDate(checkOut)}`,
    `Nights:     ${nights}`,
    `Guests:     ${numGuests}`,
    ``,
    `Total:      ${formatRupees(totalAmountInPaise)}`,
    contactBlock,
    bookingUrl ? `View booking: ${bookingUrl}` : '',
    ``,
    `Have a great stay!`,
    `— Tripz Team`,
  ].filter(Boolean).join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 8px;font-size:22px;color:#16a34a;">Booking confirmed 🎉</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Booking ID: <strong>${bookingId}</strong></p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <h3 style="margin:0 0 12px;font-size:16px;color:#0f172a;">${propertyTitle}</h3>
      <p style="margin:0 0 4px;font-size:14px;color:#475569;">${roomName}${unitsBooked > 1 ? ` × ${unitsBooked}` : ''}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">${propertyCity}${propertyAddress ? ' · ' + propertyAddress : ''}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
      <tr>
        <td style="padding:8px 0;color:#475569;border-bottom:1px solid #e2e8f0;">Check-in</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e2e8f0;"><strong>${formatDate(checkIn)}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#475569;border-bottom:1px solid #e2e8f0;">Check-out</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e2e8f0;"><strong>${formatDate(checkOut)}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#475569;border-bottom:1px solid #e2e8f0;">Nights</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e2e8f0;">${nights}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#475569;">Guests</td>
        <td style="padding:8px 0;text-align:right;">${numGuests}</td>
      </tr>
    </table>

    <div style="background:#0f172a;color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;opacity:0.8;">Total Amount</p>
      <p style="margin:0;font-size:24px;font-weight:700;">${formatRupees(totalAmountInPaise)}</p>
    </div>

    ${contactLines.length ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#78350f;">Host contact (for pre-stay questions)</p>
      ${ownerContactPhone ? `<p style="margin:0;font-size:14px;color:#0f172a;">📞 ${ownerContactPhone}</p>` : ''}
      ${ownerContactEmail ? `<p style="margin:0;font-size:14px;color:#0f172a;">✉️ ${ownerContactEmail}</p>` : ''}
    </div>` : ''}

    ${bookingUrl ? `
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${bookingUrl}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">View Booking</a>
    </p>` : ''}

    <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">Have a great stay!<br/>— Tripz Team</p>
  </div>`;

  return { subject, html, text };
};
