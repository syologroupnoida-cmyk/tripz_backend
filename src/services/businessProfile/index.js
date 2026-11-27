import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { ApiError } from '../../utils/ApiError.js';
import * as businessProfileRepo from '../../repositories/businessProfile.repository.js';

const REQUIRED_HEADERS = ['Company name', 'Location'];
const clean = (value) => String(value ?? '').trim() || null;
const isOpeningHoursNoise = (value) => /^(open|closed)(\s|$|\s*·)/i.test(value ?? '');
const cleanLocationField = (value) => {
  const normalized = clean(value);
  return normalized && !isOpeningHoursNoise(normalized) ? normalized : null;
};
const cleanUrl = (value) => {
  const normalized = clean(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};
const parseReviewCount = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/,/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([KM])?$/);
  if (!match) return null;
  const multiplier = match[2] === 'K' ? 1000 : match[2] === 'M' ? 1_000_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
};
const sourceKeyFor = (row) => {
  const cid = clean(row.Cid);
  if (cid && /cid=\d+/.test(cid)) return `google:${cid.match(/cid=(\d+)/)[1]}`;
  const identity = [row['Company name'], row.Location, row.Phone, row.Website]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('|');
  return `fallback:${crypto.createHash('sha256').update(identity).digest('hex')}`;
};

const mapRow = (row, rowNumber, adminId, isActive) => {
  const errors = [];
  const companyName = clean(row['Company name']);
  const location = clean(row.Location);
  if (!companyName) errors.push('Company name is required.');
  if (!location) errors.push('Location is required.');

  const rawRating = clean(row['Rating count']);
  const rating = rawRating === null ? null : Number(rawRating);
  if (rawRating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    errors.push('Rating count must contain a rating between 0 and 5.');
  }

  const emails = ['Email 1', 'Email 2', 'Email 3']
    .map((header) => clean(row[header]))
    .filter((email, index, all) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && all.indexOf(email) === index);

  return {
    row: rowNumber,
    errors,
    data: errors.length ? null : {
      sourceKey: sourceKeyFor(row),
      keyword: clean(row.Keyword),
      location,
      companyName,
      category: clean(row.Category),
      website: cleanUrl(row.Website),
      phone: clean(row.Phone),
      emails,
      address: cleanLocationField(row.Address),
      city: cleanLocationField(row.City),
      state: cleanLocationField(row.State),
      pincode: clean(row.Pincode),
      rating,
      reviewCount: parseReviewCount(row.Review),
      googleMapsUrl: cleanUrl(row.Cid),
      isActive,
      importedByAdminId: adminId,
    },
  };
};

export const importBusinessProfilesCsv = async ({ file, mode = 'validate', adminId, isActive = true }) => {
  if (!file) throw ApiError.badRequest('CSV file is required in the `file` form field.');
  if (!['validate', 'import'].includes(mode)) throw ApiError.badRequest('mode must be `validate` or `import`.');
  let records;
  try {
    records = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      // Google Maps exports sometimes append an empty field after the final
      // named column. Ignore that trailing value while keeping strict parsing
      // for the fields represented by headers.
      relax_column_count_more: true,
    });
  } catch (error) {
    throw ApiError.badRequest(`Invalid CSV: ${error.message}`);
  }
  if (records.length === 0) throw ApiError.badRequest('CSV contains no data rows.');
  if (records.length > 5000) throw ApiError.badRequest('CSV may contain at most 5000 profiles.');
  const headers = Object.keys(records[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw ApiError.badRequest(`Missing required CSV columns: ${missingHeaders.join(', ')}.`);
  }

  const results = records.map((row, index) => mapRow(row, index + 2, adminId, isActive));
  const validRows = results.filter((result) => result.data).map((result) => result.data);
  const uniqueRows = [...new Map(validRows.map((row) => [row.sourceKey, row])).values()];
  const invalidRows = results.filter((result) => result.errors.length > 0)
    .map(({ row, errors }) => ({ row, errors }));

  let imported = 0;
  if (mode === 'import' && uniqueRows.length) {
    const result = await businessProfileRepo.importBusinessProfiles(uniqueRows);
    imported = result.count;
  }

  return {
    mode,
    totalRows: records.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    duplicateRowsInFile: validRows.length - uniqueRows.length,
    imported,
    skippedExisting: mode === 'import' ? uniqueRows.length - imported : 0,
    errors: invalidRows.slice(0, 100),
  };
};

export const listBusinessProfiles = async (query, options) => {
  const { items, total } = await businessProfileRepo.listBusinessProfiles(query, options);
  return { items, total, take: query.take, skip: query.skip };
};

export const getBusinessProfile = async (id, options) => {
  const profile = await businessProfileRepo.findBusinessProfileById(id, options);
  if (!profile) throw ApiError.notFound('Business profile not found.');
  return profile;
};

export const updateBusinessProfile = async (id, data) => {
  await getBusinessProfile(id);
  return businessProfileRepo.updateBusinessProfile(id, data);
};

export const deleteBusinessProfile = async (id) => {
  await getBusinessProfile(id);
  return businessProfileRepo.deleteBusinessProfile(id);
};
