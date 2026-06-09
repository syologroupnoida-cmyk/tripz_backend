export const passwordResetOtpTemplate = ({ firstName, code, ttlMinutes }) => {
  const safeName = firstName || 'there';
  const subject = `Your Tripz password reset code: ${code}`;

  const text = [
    `Hi ${safeName},`,
    '',
    `We received a request to reset your Tripz password.`,
    `Your reset code is: ${code}`,
    `This code expires in ${ttlMinutes} minutes.`,
    '',
    'If you did not request this, you can safely ignore this email — your password will not change.',
    '',
    '— Tripz',
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 16px;font-size:20px;">Reset your password</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hi ${safeName}, use the code below to set a new password for your Tripz account.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f1f5f9;padding:16px 24px;border-radius:8px;text-align:center;margin:24px 0;">
      ${code}
    </div>
    <p style="margin:0 0 12px;font-size:13px;color:#475569;">This code expires in <strong>${ttlMinutes} minutes</strong>.</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">If you did not request this, you can safely ignore this email — your password will not change.</p>
  </div>`;

  return { subject, html, text };
};
