import { sendMail } from './mailer.js';
import { verificationOtpTemplate } from './templates/verificationOtp.template.js';
import { passwordResetOtpTemplate } from './templates/passwordResetOtp.template.js';
import { passwordChangedNoticeTemplate } from './templates/passwordChangedNotice.template.js';
import { vendorApprovedNoticeTemplate } from './templates/vendorApprovedNotice.template.js';
import { vendorRejectedNoticeTemplate } from './templates/vendorRejectedNotice.template.js';
import { env } from '../../config/env.js';

export { verifyMailTransport } from './mailer.js';

export const sendVerificationOtp = async ({ to, firstName, code }) => {
  const { subject, html, text } = verificationOtpTemplate({
    firstName,
    code,
    ttlMinutes: env.OTP_TTL_MINUTES,
  });
  return sendMail({ to, subject, html, text });
};

export const sendPasswordResetOtp = async ({ to, firstName, code }) => {
  const { subject, html, text } = passwordResetOtpTemplate({
    firstName,
    code,
    ttlMinutes: env.OTP_TTL_MINUTES,
  });
  return sendMail({ to, subject, html, text });
};

export const sendPasswordChangedNotice = async ({ to, firstName, when = new Date() }) => {
  const { subject, html, text } = passwordChangedNoticeTemplate({ firstName, when });
  return sendMail({ to, subject, html, text });
};

export const sendVendorApprovedNotice = async ({ to, firstName, loginUrl }) => {
  const { subject, html, text } = vendorApprovedNoticeTemplate({ firstName, loginUrl });
  return sendMail({ to, subject, html, text });
};

export const sendVendorRejectedNotice = async ({ to, firstName, reason, loginUrl }) => {
  const { subject, html, text } = vendorRejectedNoticeTemplate({ firstName, reason, loginUrl });
  return sendMail({ to, subject, html, text });
};
