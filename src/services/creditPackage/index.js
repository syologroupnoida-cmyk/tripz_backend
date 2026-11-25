import { ApiError } from '../../utils/ApiError.js';
import * as repo from '../../repositories/creditPackage.repository.js';

export const createCreditPackage = (data) => repo.create(data);

export const updateCreditPackage = async ({ id, data }) => {
  const current = await repo.findById(id, { includeDeleted: true });
  if (!current) throw ApiError.notFound('Credit package not found.');
  if (current.deletedAt) throw ApiError.badRequest('A deleted credit package cannot be updated.');
  const salePrice = data.salePriceInPaise ?? current.salePriceInPaise;
  const offerPrice = data.offerPriceInPaise ?? current.offerPriceInPaise;
  if (offerPrice > salePrice) {
    throw ApiError.badRequest('offerPriceInPaise cannot exceed salePriceInPaise.');
  }
  return repo.update(id, data);
};

export const deleteCreditPackage = async (id) => {
  const current = await repo.findById(id, { includeDeleted: true });
  if (!current) throw ApiError.notFound('Credit package not found.');
  if (current.deletedAt) return current;
  return repo.softDelete(id);
};

export const getCreditPackage = async (id) => {
  const item = await repo.findById(id);
  if (!item) throw ApiError.notFound('Credit package not found.');
  return item;
};

export const listCreditPackagesForAdmin = async (query) => {
  const result = await repo.listForAdmin(query);
  return { ...result, take: query.take, skip: query.skip };
};

export const listActiveCreditPackages = async () => {
  const items = await repo.listActive();
  return { items, total: items.length };
};

export const getActiveCreditPackage = async (id) => {
  const item = await repo.findById(id);
  if (!item || !item.isActive) throw ApiError.notFound('Credit package not found or inactive.');
  return item;
};
