import prisma from '../config/db.js';

export const createRefreshToken = async ({ tokenHash, userId, expiresAt }) => {
  return prisma.refreshToken.create({
    data: {
      token: tokenHash,
      userId,
      expiresAt,
    },
  });
};

export const findRefreshTokenByHash = async (tokenHash) => {
  return prisma.refreshToken.findUnique({
    where: { token: tokenHash },
  });
};

export const revokeRefreshTokenById = async (id) => {
  return prisma.refreshToken.update({
    where: { id },
    data: { isRevoked: true },
  });
};

export const revokeAllRefreshTokensForUser = async (userId) => {
  return prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
};

export const rotateRefreshToken = async ({ oldTokenId, newTokenHash, userId, expiresAt }) => {
  return prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: oldTokenId },
      data: { isRevoked: true },
    }),
    prisma.refreshToken.create({
      data: { token: newTokenHash, userId, expiresAt },
    }),
  ]);
};

export const deleteExpiredRefreshTokens = async () => {
  return prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};
