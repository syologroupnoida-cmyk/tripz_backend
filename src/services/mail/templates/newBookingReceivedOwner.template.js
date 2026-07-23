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

export const newBookingReceivedOwnerTemplate = ({
  ownerName,
  bookingId,
  propertyTitle,
  roomName,
  checkIn,
  checkOut,
  nights,
  numGuests,
  unitsBooked,
  totalAmountInPaise,
  guestName,
  guestPhone,
  guestEmail,
  specialRequests,
  dashboardUrl,
}) => {
  const safeName = ownerName || 'there';
  const subject = `New booking — ${propertyTitle} (${formatDate(checkIn)})`;

  const text = [
    `Hi ${safeName},`,
    '',
    `You have a new booking! Guest details below.`,
    '',
    `Booking ID: ${bookingId}`,
    `Property:   ${propertyTitle}`,
    `Room:       ${roomName}${unitsBooked > 1 ? ` × ${unitsBooked}` : ''}`,
    ``,
    `Check-in:   ${formatDate(checkIn)}`,
    `Check-out:  ${formatDate(checkOut)}`,
    `Nights:     ${nights}`,
    `Guests:     ${numGuests}`,
    `Total:      ${formatRupees(totalAmountInPaise)}`,
    ``,
    `Guest name:  ${guestName}`,
    `Guest phone: ${guestPhone}`,
    `Guest email: ${guestEmail}`,
    specialRequests ? `\nSpecial requests:\n${specialRequests}\n` : '',
    dashboardUrl ? `Manage booking: ${dashboardUrl}` : '',
    ``,
    `Please prepare for the guest's arrival.`,
    `— Tripz Team`,
  ].filter(Boolean).join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">New booking received 📩</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Booking ID: <strong>${bookingId}</strong></p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">${propertyTitle}</h3>
      <p style="margin:0;font-size:14px;color:#1e40af;">${roomName}${unitsBooked > 1 ? ` × ${unitsBooked}` : ''}</p>
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
        <td style="padding:8px 0;color:#475569;border-bottom:1px solid #e2e8f0;">Guests</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e2e8f0;">${numGuests}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#475569;font-weight:600;">Total</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;">${formatRupees(totalAmountInPaise)}</td>
      </tr>
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <h3 style="margin:0 0 12px;font-size:15px;color:#166534;">Guest Contact</h3>
      <p style="margin:0 0 4px;font-size:14px;color:#0f172a;"><strong>${guestName}</strong></p>
      <p style="margin:0 0 4px;font-size:14px;color:#0f172a;">📞 ${guestPhone}</p>
      <p style="margin:0;font-size:14px;color:#0f172a;">✉️ ${guestEmail}</p>
    </div>

    ${specialRequests ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#78350f;">Special Requests</p>
      <p style="margin:0;font-size:14px;color:#0f172a;white-space:pre-wrap;">${specialRequests}</p>
    </div>` : ''}

    ${dashboardUrl ? `
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${dashboardUrl}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Manage Booking</a>
    </p>` : ''}

    <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">Please prepare for the guest's arrival.<br/>— Tripz Team</p>
  </div>`;

  return { subject, html, text };
};
