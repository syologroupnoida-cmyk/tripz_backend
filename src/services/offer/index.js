import { parse } from 'csv-parse/sync';
import prisma from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import * as offerRepo from '../../repositories/offer.repository.js';
import { createOfferSchema } from '../../validators/offer.validator.js';

const REDEEMABLE_TYPES = new Set(['PERCENTAGE', 'FLAT']);

const presentOffer = (offer) => ({
  ...offer,
  packageIds: offer.packageTargets?.map((target) => target.packageId) ?? [],
  propertyIds: offer.propertyTargets?.map((target) => target.propertyId) ?? [],
  packageTargets: undefined,
  propertyTargets: undefined,
});

const verifyTargets = async ({ packageIds = [], propertyIds = [] }) => {
  const [packageCount, propertyCount] = await Promise.all([
    packageIds.length ? prisma.package.count({ where: { id: { in: packageIds }, deletedAt: null } }) : 0,
    propertyIds.length ? prisma.property.count({ where: { id: { in: propertyIds }, deletedAt: null } }) : 0,
  ]);
  if (packageCount !== new Set(packageIds).size) throw ApiError.badRequest('One or more packageIds are invalid.');
  if (propertyCount !== new Set(propertyIds).size) throw ApiError.badRequest('One or more propertyIds are invalid.');
};

const verifyActivatable = (offer) => {
  if (!REDEEMABLE_TYPES.has(offer.discountType)) {
    throw ApiError.badRequest(`${offer.discountType} offers cannot be activated until their fulfilment flow is configured.`, {
      code: 'OFFER_TYPE_NOT_REDEEMABLE',
    });
  }
  if (!offer.discountValue || offer.discountValue <= 0) {
    throw ApiError.badRequest('An active discount offer requires a positive discountValue.');
  }
  if (offer.discountType === 'PERCENTAGE' && offer.discountValue > 100) {
    throw ApiError.badRequest('Percentage discountValue cannot exceed 100.');
  }
};

export const createOffer = async ({ data, adminId }) => {
  await verifyTargets(data);
  return presentOffer(await offerRepo.createOffer({
    ...data,
    status: 'DRAFT',
    createdByAdminId: adminId,
  }));
};

export const updateOffer = async ({ id, data }) => {
  const current = await offerRepo.findOfferById(id);
  if (!current) throw ApiError.notFound('Offer not found.');
  await verifyTargets(data);
  const merged = { ...current, ...data };
  if (merged.validTo <= merged.validFrom) throw ApiError.badRequest('validTo must be after validFrom.');
  if (merged.status === 'ACTIVE') verifyActivatable(merged);
  return presentOffer(await offerRepo.updateOffer(id, data));
};

export const getOffer = async (id) => {
  const offer = await offerRepo.findOfferById(id);
  if (!offer) throw ApiError.notFound('Offer not found.');
  return presentOffer(offer);
};

export const listOffers = async (query, options) => {
  const { items, total } = await offerRepo.listOffers(query, options);
  return { items: items.map(presentOffer), total, take: query.take, skip: query.skip };
};

export const deleteOffer = async (id) => {
  await getOffer(id);
  return presentOffer(await offerRepo.softDeleteOffer(id));
};

export const setOfferStatus = async ({ id, status }) => updateOffer({
  id,
  data: { status },
});

const normalize = (value) => String(value ?? '').trim();
const enumToken = (value) => normalize(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const parseInteger = (value) => {
  const digits = normalize(value).replace(/[^0-9.-]/g, '');
  return digits ? Number(digits) : null;
};
const parseDate = (value, endOfDay = false) => {
  const date = new Date(`${normalize(value)}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const mapDiscountType = (value) => ({
  PERCENTAGE: 'PERCENTAGE', FLAT: 'FLAT', FREEBIE: 'FREEBIE', CASHBACK: 'CASHBACK',
  CREDIT: 'CREDIT', 'STARTING_PRICE': 'STARTING_PRICE', 'SPECIAL_PRICE': 'SPECIAL_PRICE',
  'TRAVEL_CREDIT': 'TRAVEL_CREDIT',
})[enumToken(value)];

const mapApplicableTo = (value) => {
  const text = normalize(value).toLowerCase();
  if (text.includes('hotel') && (text.includes('package') || text.includes('tour'))) return 'BOTH';
  if (text.includes('hotel') || text.includes('booking')) return 'PROPERTY';
  return 'PACKAGE';
};

const mapCustomer = (value) => {
  const text = normalize(value).toLowerCase();
  if (text === 'new customers') return { customerType: 'NEW', customerSegment: null };
  if (text === 'existing customers') return { customerType: 'EXISTING', customerSegment: null };
  if (text === 'all customers') return { customerType: 'ALL', customerSegment: null };
  return { customerType: 'ALL', customerSegment: normalize(value) || null };
};

const mapEligibility = (value) => {
  const text = normalize(value);
  const lower = text.toLowerCase();
  const structured = { eligibilityText: text || null };
  const advance = lower.match(/book\s+(\d+)\+?\s+days/);
  const nights = lower.match(/(\d+)\+\s+nights/);
  const guests = lower.match(/(\d+)\+\s+travellers/);
  if (advance) structured.advanceBookingDays = Number(advance[1]);
  if (nights) structured.minimumStayNights = Number(nights[1]);
  if (guests) structured.minimumGuests = Number(guests[1]);
  return structured;
};

const mapCsvRow = (row, rowNumber) => {
  const errors = [];
  const warnings = [];
  const discountType = mapDiscountType(row['Discount Type']);
  const couponCode = normalize(row['Coupon Code']).toUpperCase();
  const validFrom = parseDate(row['Valid From']);
  const validTo = parseDate(row['Valid To'], true);
  if (!normalize(row['Offer Name'])) errors.push('Offer Name is required.');
  if (!couponCode) errors.push('Coupon Code is required.');
  if (!discountType) errors.push(`Unsupported Discount Type: ${row['Discount Type']}.`);
  if (!validFrom || !validTo) errors.push('Valid From and Valid To must use YYYY-MM-DD.');

  const rawValue = parseInteger(row['Discount Value']);
  const discountValue = discountType === 'FLAT' ? (rawValue === null ? null : rawValue * 100) : rawValue;
  if (!REDEEMABLE_TYPES.has(discountType)) warnings.push(`${discountType ?? 'Unknown'} requires a future fulfilment flow.`);
  if (!['All Customers', 'New Customers', 'Existing Customers'].includes(normalize(row['Customer Type']))) {
    warnings.push(`Customer segment "${normalize(row['Customer Type'])}" is preserved but not automatically enforced.`);
  }
  if (!/^(Book \d+\+? days(?: in advance)?|\d+\+ nights|\d+\+ travellers|First booking only|Previous Tripz booking)$/i.test(normalize(row['Eligibility / Condition']))) {
    warnings.push('Eligibility is descriptive and must be reviewed before activation.');
  }

  const customer = mapCustomer(row['Customer Type']);
  if (/first booking/i.test(normalize(row['Eligibility / Condition']))) customer.customerType = 'NEW';
  if (/previous tripz booking/i.test(normalize(row['Eligibility / Condition']))) customer.customerType = 'EXISTING';

  return {
    row: rowNumber,
    couponCode,
    errors,
    warnings,
    data: {
      name: normalize(row['Offer Name']), couponCode,
      description: normalize(row['Customer-Facing Description']) || null,
      bannerText: normalize(row['Banner Text']) || null,
      termsAndConditions: normalize(row['Terms & Conditions']) || null,
      discountType, discountValue,
      benefitText: REDEEMABLE_TYPES.has(discountType) ? null : normalize(row['Discount Value']) || null,
      applicableTo: mapApplicableTo(row['Applicable For']),
      ...customer,
      ...mapEligibility(row['Eligibility / Condition']),
      destinations: [], packageTypes: [], propertyTypes: [],
      validFrom, validTo,
      usageLimit: parseInteger(row['Usage Limit']),
      perCustomerLimit: parseInteger(row['Per Customer Limit']) ?? 1,
      status: 'DRAFT',
    },
  };
};

const isEmptyMarker = (value) => ['', 'N/A', 'ALL'].includes(normalize(value).toUpperCase());
const optionalInteger = (value) => isEmptyMarker(value) ? undefined : Number(value);
const listValue = (value) => isEmptyMarker(value)
  ? []
  : normalize(value).split('|').map((item) => item.trim()).filter(Boolean);
const nullableText = (value) => isEmptyMarker(value) ? null : normalize(value);

const mapStructuredCsvRow = (row, rowNumber) => {
  const candidate = {
    name: normalize(row.name),
    couponCode: normalize(row.couponCode),
    description: normalize(row.description) || null,
    bannerText: normalize(row.bannerText) || null,
    termsAndConditions: normalize(row.termsAndConditions) || null,
    discountType: normalize(row.discountType),
    discountValue: optionalInteger(row.discountValue) ?? null,
    maxDiscountInPaise: optionalInteger(row.maxDiscountInPaise) ?? null,
    benefitText: nullableText(row.benefitText),
    applicableTo: normalize(row.applicableTo),
    customerType: normalize(row.customerType) || 'ALL',
    customerSegment: nullableText(row.customerSegment),
    eligibilityText: normalize(row.eligibilityText) || null,
    minimumBookingInPaise: optionalInteger(row.minimumBookingInPaise) ?? null,
    minimumStayNights: optionalInteger(row.minimumStayNights) ?? null,
    minimumGuests: optionalInteger(row.minimumGuests) ?? null,
    advanceBookingDays: optionalInteger(row.advanceBookingDays) ?? null,
    destinations: listValue(row.destinations),
    packageTypes: listValue(row.packageTypes),
    propertyTypes: listValue(row.propertyTypes),
    packageIds: listValue(row.packageIds),
    propertyIds: listValue(row.propertyIds),
    validFrom: normalize(row.validFrom),
    validTo: normalize(row.validTo),
    usageLimit: optionalInteger(row.usageLimit) ?? null,
    perCustomerLimit: optionalInteger(row.perCustomerLimit) ?? 1,
  };
  const parsed = createOfferSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      row: rowNumber,
      couponCode: candidate.couponCode,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`),
      warnings: [],
      data: candidate,
    };
  }
  return {
    row: rowNumber,
    couponCode: parsed.data.couponCode,
    errors: [],
    warnings: [],
    data: { ...parsed.data, status: 'DRAFT' },
  };
};

export const importOffersCsv = async ({ file, mode = 'validate', adminId }) => {
  if (!file) throw ApiError.badRequest('CSV file is required in the `file` form field.');
  if (!['validate', 'import'].includes(mode)) throw ApiError.badRequest('mode must be `validate` or `import`.');
  let records;
  try {
    records = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (error) {
    throw ApiError.badRequest(`Invalid CSV: ${error.message}`);
  }
  if (records.length > 1000) throw ApiError.badRequest('CSV may contain at most 1000 offers.');
  const structured = records.length > 0 && Object.hasOwn(records[0], 'couponCode');
  const results = records.map((row, index) =>
    structured ? mapStructuredCsvRow(row, index + 2) : mapCsvRow(row, index + 2));
  const valid = results.filter((result) => result.errors.length === 0);
  let imported = 0;
  if (mode === 'import') {
    for (const result of valid) {
      const existing = await offerRepo.findOfferByCode(result.data.couponCode);
      if (existing) await offerRepo.updateOffer(existing.id, result.data);
      else await offerRepo.createOffer({ ...result.data, createdByAdminId: adminId });
      imported += 1;
    }
  }
  return {
    mode, totalRows: records.length, validRows: valid.length,
    invalidRows: results.length - valid.length, imported,
    warningRows: results.filter((result) => result.warnings.length > 0).length,
    rows: results.map(({ data, ...result }) => ({ ...result, preview: data })),
  };
};

const failCoupon = (message, code, details = {}) => {
  throw ApiError.badRequest(message, { code, ...details });
};

const calculateDiscount = (offer, subtotalAmountInPaise) => {
  if (!REDEEMABLE_TYPES.has(offer.discountType)) failCoupon('This offer is not a price-discount coupon.', 'OFFER_NOT_REDEEMABLE');
  let discountAmountInPaise = offer.discountType === 'PERCENTAGE'
    ? Math.floor(subtotalAmountInPaise * offer.discountValue / 100)
    : offer.discountValue;
  if (offer.maxDiscountInPaise) discountAmountInPaise = Math.min(discountAmountInPaise, offer.maxDiscountInPaise);
  discountAmountInPaise = Math.min(discountAmountInPaise, subtotalAmountInPaise);
  return { subtotalAmountInPaise, discountAmountInPaise, finalAmountInPaise: subtotalAmountInPaise - discountAmountInPaise };
};

const evaluateOffer = async ({ offer, customerUserId, productType, product, subtotalAmountInPaise, nights, numGuests, startDate, db = prisma }) => {
  const now = new Date();
  if (!offer || offer.status !== 'ACTIVE' || offer.deletedAt) failCoupon('Coupon is not active.', 'COUPON_INACTIVE');
  if (now < offer.validFrom) failCoupon('Coupon is not valid yet.', 'COUPON_NOT_STARTED');
  if (now > offer.validTo) failCoupon('Coupon has expired.', 'COUPON_EXPIRED');
  if (![productType, 'BOTH'].includes(offer.applicableTo)) failCoupon(`Coupon does not apply to ${productType.toLowerCase()} bookings.`, 'COUPON_NOT_APPLICABLE');
  if (offer.usageLimit !== null && offer.redemptionCount >= offer.usageLimit) failCoupon('Coupon usage limit has been reached.', 'COUPON_USAGE_LIMIT');
  if (offer.minimumBookingInPaise && subtotalAmountInPaise < offer.minimumBookingInPaise) failCoupon('Minimum booking amount has not been met.', 'MINIMUM_BOOKING_NOT_MET', { minimumBookingInPaise: offer.minimumBookingInPaise });
  if (offer.minimumStayNights && (nights ?? 0) < offer.minimumStayNights) failCoupon('Minimum stay requirement has not been met.', 'MINIMUM_STAY_NOT_MET', { minimumStayNights: offer.minimumStayNights });
  if (offer.minimumGuests && numGuests < offer.minimumGuests) failCoupon('Minimum guest requirement has not been met.', 'MINIMUM_GUESTS_NOT_MET', { minimumGuests: offer.minimumGuests });
  if (offer.advanceBookingDays && startDate) {
    const days = Math.floor((startDate - now) / 86400000);
    if (days < offer.advanceBookingDays) failCoupon('Advance-booking requirement has not been met.', 'ADVANCE_BOOKING_NOT_MET', { advanceBookingDays: offer.advanceBookingDays });
  }
  const targets = productType === 'PROPERTY' ? offer.propertyTargets.map((item) => item.propertyId) : offer.packageTargets.map((item) => item.packageId);
  if (targets.length && !targets.includes(product.id)) failCoupon('Coupon does not apply to this selection.', 'COUPON_TARGET_MISMATCH');
  const destination = String(product.city ?? product.destination ?? '').toLowerCase();
  if (offer.destinations.length && !offer.destinations.some((item) => item.toLowerCase() === destination)) failCoupon('Coupon does not apply to this destination.', 'COUPON_DESTINATION_MISMATCH');
  if (productType === 'PROPERTY' && offer.propertyTypes.length && !offer.propertyTypes.includes(product.propertyType)) failCoupon('Coupon does not apply to this property type.', 'COUPON_PROPERTY_TYPE_MISMATCH');
  if (productType === 'PACKAGE' && offer.packageTypes.length && !offer.packageTypes.includes(product.packageType)) failCoupon('Coupon does not apply to this package type.', 'COUPON_PACKAGE_TYPE_MISMATCH');
  const bookingCount = await offerRepo.countCompletedBookings(customerUserId, db);
  if (offer.customerType === 'NEW' && bookingCount > 0) failCoupon('Coupon is only for new customers.', 'NEW_CUSTOMER_ONLY');
  if (offer.customerType === 'EXISTING' && bookingCount === 0) failCoupon('Coupon is only for existing customers.', 'EXISTING_CUSTOMER_ONLY');
  const usage = await db.offerCustomerUsage.findUnique({ where: { offerId_customerUserId: { offerId: offer.id, customerUserId } } });
  if (usage && usage.usageCount >= offer.perCustomerLimit) failCoupon('You have already used this coupon the maximum number of times.', 'CUSTOMER_USAGE_LIMIT');
  return calculateDiscount(offer, subtotalAmountInPaise);
};

const propertyQuote = async (data) => {
  const property = await prisma.property.findFirst({ where: { id: data.propertyId, status: 'APPROVED', deletedAt: null }, select: { id: true, city: true, propertyType: true } });
  if (!property) throw ApiError.notFound('Property not found or unavailable.');
  const ids = data.items.map((item) => item.roomId);
  const rooms = await prisma.propertyRoom.findMany({ where: { id: { in: ids }, propertyId: property.id, isActive: true }, select: { id: true, pricePerNightInPaise: true } });
  if (rooms.length !== new Set(ids).size) throw ApiError.badRequest('One or more room items are invalid.');
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const nights = Math.ceil((data.checkOut - data.checkIn) / 86400000);
  const subtotalAmountInPaise = data.items.reduce((sum, item) => sum + byId.get(item.roomId).pricePerNightInPaise * nights * item.unitsBooked, 0);
  return { product: property, subtotalAmountInPaise, nights, startDate: data.checkIn };
};

export const validateCoupon = async ({ customerUserId, data }) => {
  const offer = await offerRepo.findOfferByCode(data.couponCode);
  let quote;
  if (data.productType === 'PROPERTY') quote = await propertyQuote(data);
  else {
    const pkg = await prisma.package.findFirst({ where: { id: data.packageId, status: 'APPROVED', deletedAt: null }, select: { id: true, destination: true, packageType: true, priceInPaise: true, startDate: true } });
    if (!pkg || pkg.priceInPaise === null) throw ApiError.notFound('Package not found or unavailable.');
    quote = { product: pkg, subtotalAmountInPaise: pkg.priceInPaise, startDate: pkg.startDate };
  }
  const pricing = await evaluateOffer({ offer, customerUserId, productType: data.productType, ...quote, numGuests: data.numGuests });
  return { couponCode: offer.couponCode, offerName: offer.name, ...pricing, validUntil: offer.validTo };
};

export const claimPropertyOfferTx = async (tx, { couponCode, customerUserId, property, subtotalAmountInPaise, nights, numGuests, checkIn }) => {
  if (!couponCode) return { subtotalAmountInPaise, discountAmountInPaise: 0, finalAmountInPaise: subtotalAmountInPaise, offer: null };
  const offer = await offerRepo.findOfferByCode(couponCode.toUpperCase(), tx);
  const pricing = await evaluateOffer({ offer, customerUserId, productType: 'PROPERTY', product: property, subtotalAmountInPaise, nights, numGuests, startDate: checkIn, db: tx });
  const offerClaim = await tx.offer.updateMany({
    where: { id: offer.id, status: 'ACTIVE', ...(offer.usageLimit !== null ? { redemptionCount: { lt: offer.usageLimit } } : {}) },
    data: { redemptionCount: { increment: 1 } },
  });
  if (offerClaim.count !== 1) failCoupon('Coupon usage limit has just been reached.', 'COUPON_USAGE_LIMIT');
  await tx.offerCustomerUsage.upsert({
    where: { offerId_customerUserId: { offerId: offer.id, customerUserId } },
    create: { offerId: offer.id, customerUserId, usageCount: 0 }, update: {},
  });
  const customerClaim = await tx.offerCustomerUsage.updateMany({
    where: { offerId: offer.id, customerUserId, usageCount: { lt: offer.perCustomerLimit } },
    data: { usageCount: { increment: 1 } },
  });
  if (customerClaim.count !== 1) failCoupon('You have already used this coupon the maximum number of times.', 'CUSTOMER_USAGE_LIMIT');
  return { ...pricing, offer };
};
