const formatDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const bookingCancelledOwnerTemplate = ({
  ownerName,
  bookingId,
  propertyTitle,
  roomName,
  checkIn,
  checkOut,
  guestName,
  cancellationReason,
}) => {
  const safeName = ownerName || 'there';
  const subject = `Booking cancelled — ${propertyTitle} (${formatDate(checkIn)})`;

  const text = [
    `Hi ${safeName},`,
    '',
    `A booking for your property has been cancelled by the guest. The room is now available again.`,
    '',
    `Booking ID: ${bookingId}`,
    `Property:   ${propertyTitle}`,
    `Room:       ${roomName}`,
    `Check-in:   ${formatDate(checkIn)}`,
    `Check-out:  ${formatDate(checkOut)}`,
    `Guest:      ${guestName}`,
    cancellationReason ? `\nGuest's reason: ${cancellationReason}` : '',
    '',
    `— Tripz Team`,
  ].filter(Boolean).join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 8px;font-size:20px;color:#dc2626;">Booking cancelled by guest</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">Booking ID: <strong>${bookingId}</strong></p>

    <p style="margin:0 0 16px;font-size:14px;color:#0f172a;">Hi ${safeName}, a booking for <strong>${propertyTitle}</strong> has been cancelled by the guest. The room is now available again for new bookings.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:14px;color:#0f172a;"><strong>${roomName}</strong></p>
      <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${formatDate(checkIn)} → ${formatDate(checkOut)}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Guest: ${guestName}</p>
    </div>

    ${cancellationReason ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#78350f;">Guest's reason</p>
      <p style="margin:0;font-size:14px;color:#0f172a;white-space:pre-wrap;">${cancellationReason}</p>
    </div>` : ''}

    <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">— Tripz Team</p>
  </div>`;

  return { subject, html, text };
};
