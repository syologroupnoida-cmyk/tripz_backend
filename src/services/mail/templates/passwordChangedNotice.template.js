export const passwordChangedNoticeTemplate = ({ firstName, when }) => {
  const safeName = firstName || 'there';
  const subject = 'Your Tripz password was changed';
  const whenStr = (when instanceof Date ? when : new Date(when)).toUTCString();

  const text = [
    `Hi ${safeName},`,
    '',
    `Your Tripz password was changed on ${whenStr}.`,
    '',
    `If this was you — no action needed.`,
    `If this was NOT you — your account may be compromised. Contact support immediately and consider resetting your password again.`,
    '',
    '— Tripz Security',
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 16px;font-size:20px;">Password changed</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hi ${safeName}, your Tripz password was just changed.</p>
    <div style="background:#f1f5f9;padding:12px 16px;border-radius:8px;font-size:13px;color:#475569;margin:16px 0;">
      <strong>When:</strong> ${whenStr}
    </div>
    <p style="margin:0 0 12px;font-size:13px;color:#475569;">If this was you — no action needed.</p>
    <p style="margin:0;font-size:13px;color:#b91c1c;"><strong>If this was NOT you</strong>, your account may be compromised. Contact support immediately and reset your password again.</p>
  </div>`;

  return { subject, html, text };
};
