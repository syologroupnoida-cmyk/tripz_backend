import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

let transporter;

const buildTransporter = () => {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
};

const getTransporter = () => {
  if (!transporter) transporter = buildTransporter();
  return transporter;
};

export const verifyMailTransport = async () => {
  try {
    await getTransporter().verify();
    console.log('[mail] SMTP transport verified.');
  } catch (error) {
    console.error('[mail] SMTP verification failed:', error.message);
  }
};

/**
 * Low-level send. All purpose-specific helpers funnel through here so the
 * transport (Mailtrap dev / Resend prod / SES later) can be swapped in one place.
 */
export const sendMail = async ({ to, subject, html, text }) => {
  const from = `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`;
  return getTransporter().sendMail({ from, to, subject, html, text });
};
