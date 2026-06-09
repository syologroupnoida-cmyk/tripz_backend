import prisma from '../config/db.js';

export const createEmailOtp = async ({ userId, codeHash, purpose, expiresAt }) => {
  return prisma.emailOtp.create({
    data: { userId, codeHash, purpose, expiresAt },
  });
};

export const findOtpById = async (id) => {
  return prisma.emailOtp.findUnique({ where: { id } });
};

export const findLatestActiveOtp = async ({ userId, purpose }) => {
  return prisma.emailOtp.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const incrementOtpAttempts = async (id) => {
  return prisma.emailOtp.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  });
};

export const consumeOtp = async (id) => {
  return prisma.emailOtp.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
};

export const invalidateActiveOtps = async ({ userId, purpose }) => {
  return prisma.emailOtp.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
};

export const deleteExpiredOtps = async () => {
  return prisma.emailOtp.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};
