export const vendorApprovedNoticeTemplate = ({ firstName, loginUrl }) => {
  const safeName = firstName || 'there';
  const subject = 'Your Tripz vendor account is approved';
  const safeLoginUrl = loginUrl || '#';

  const text = [
    `Hi ${safeName},`,
    '',
    `Great news — your Tripz vendor account has been approved by our team.`,
    `You can now log in and start browsing the leads marketplace.`,
    '',
    `Log in: ${safeLoginUrl}`,
    '',
    `If you have any questions, just reply to this email.`,
    '',
    `— Tripz Team`,
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 16px;font-size:20px;color:#16a34a;">Your account is approved</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hi ${safeName}, your Tripz vendor account has been approved by our team.</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">You can now log in and start browsing the leads marketplace.</p>
    <p style="margin:0 0 24px;">
      <a href="${safeLoginUrl}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Log in to Tripz</a>
    </p>
    <p style="margin:0;font-size:13px;color:#475569;">If you have any questions, just reply to this email.</p>
  </div>`;

  return { subject, html, text };
};
