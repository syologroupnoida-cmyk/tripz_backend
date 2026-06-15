export const vendorRejectedNoticeTemplate = ({ firstName, reason, loginUrl }) => {
  const safeName = firstName || 'there';
  const subject = 'Update on your Tripz vendor application';
  const safeLoginUrl = loginUrl || '#';
  const safeReason = reason || 'No specific reason was provided.';

  const text = [
    `Hi ${safeName},`,
    '',
    `Thanks for applying to become a Tripz vendor. After reviewing your`,
    `submission, we were unable to approve your account at this time.`,
    '',
    `Reason: ${safeReason}`,
    '',
    `You can log in and update your KYC to address the issue, then resubmit.`,
    `Log in: ${safeLoginUrl}`,
    '',
    `If you believe this was a mistake or need clarification, reply to this email.`,
    '',
    `— Tripz Team`,
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
    <h2 style="margin:0 0 16px;font-size:20px;">Update on your application</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Hi ${safeName}, thanks for applying to become a Tripz vendor. After reviewing your submission, we were unable to approve your account at this time.</p>
    <div style="background:#fef2f2;border-left:4px solid #b91c1c;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong style="display:block;color:#7f1d1d;font-size:13px;margin-bottom:4px;">Reason</strong>
      <span style="font-size:14px;color:#0f172a;">${safeReason}</span>
    </div>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">You can log in, update your KYC to address the issue, and resubmit.</p>
    <p style="margin:0 0 24px;">
      <a href="${safeLoginUrl}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Log in to fix &amp; resubmit</a>
    </p>
    <p style="margin:0;font-size:13px;color:#475569;">If you believe this was a mistake or need clarification, just reply to this email.</p>
  </div>`;

  return { subject, html, text };
};
