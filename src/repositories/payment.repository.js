import prisma from '../config/db.js';

export const createPayment = (data) => prisma.payment.create({ data });
export const updatePayment = (id, data) => prisma.payment.update({ where: { id }, data });
export const getPaymentById = (id) => prisma.payment.findUnique({ where: { id } });
export const getPaymentByOrderId = (providerOrderId) =>
  prisma.payment.findUnique({ where: { providerOrderId } });
export const getPaymentByProviderPaymentId = (providerPaymentId) =>
  prisma.payment.findUnique({ where: { providerPaymentId } });
export const findReusablePayment = ({ userId, purpose, referenceId }) =>
  prisma.payment.findFirst({
    where: { userId, purpose, referenceId, status: { in: ['CREATED', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
  });
