const formatDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const bookingCancelledGuestTemplate = ({
  guestName,
  bookingId,
  propertyTitle,
  checkIn,
  checkOut,
  cancellationReason,
}) => {
  const safeName = guestName || 'there';
  const subject = `Booking cancelled — ${propertyTitle}`;

  const text = [
    `Hi ${safeName},`,
    '',
    `Your booking has been cancelled successfully.`,
    '',
    `Booking ID: ${bookingId}`,
    `Property:   ${propertyTitle}`,
    `Check-in:   ${formatDate(checkIn)}`,
    `Check-out:  ${formatDate(checkOut)}`,
    cancellationReason ? `\nYour reason: ${cancellationReason}` : '',
    '',
    `We hope to host you soon on Tripz.`,
    `— Tripz Team`,
  ].filter(Boolean).join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 8px;font-size:20px;color:#dc2626;">Booking cancelled</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Booking ID: <strong>${bookingId}</strong></p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">${propertyTitle}</h3>
      <p style="margin:0;font-size:13px;color:#64748b;">${formatDate(checkIn)} → ${formatDate(checkOut)}</p>
    </div>

    ${cancellationReason ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#475569;">Your reason</p>
      <p style="margin:0;font-size:14px;color:#0f172a;white-space:pre-wrap;">${cancellationReason}</p>
    </div>` : ''}

    <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">We hope to host you soon on Tripz.<br/>— Tripz Team</p>
  </div>`;

  return { subject, html, text };
};
