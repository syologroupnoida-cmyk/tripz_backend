import { z } from 'zod';

const discountTypes = [
  'PERCENTAGE', 'FLAT', 'FREEBIE', 'CASHBACK', 'CREDIT',
  'STARTING_PRICE', 'SPECIAL_PRICE', 'TRAVEL_CREDIT',
];
const applicableTo = ['PACKAGE', 'PROPERTY', 'BOTH'];
const customerTypes = ['ALL', 'NEW', 'EXISTING'];
const statuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'];
const packageTypes = [
  'HONEYMOON', 'FAMILY', 'HOLIDAY', 'COUPLE', 'SOLO', 'GROUP', 'ADVENTURE',
  'RELIGIOUS', 'BEACH', 'HILL_STATION', 'WILDLIFE', 'CULTURAL', 'CORPORATE',
  'NATURE', 'WATERACTIVITY', 'OTHER',
];
const propertyTypes = ['HOTEL', 'VILLA', 'HOMESTAY', 'STUDIO', 'RESORT', 'GUEST_HOUSE'];

const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .transform((value) => new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value));

const offerFields = {
  name: z.string().trim().min(2).max(150),
  couponCode: z.string().trim().min(3).max(50)
    .regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).nullable().optional(),
  bannerText: z.string().trim().max(250).nullable().optional(),
  termsAndConditions: z.string().trim().max(5000).nullable().optional(),
  discountType: z.enum(discountTypes),
  discountValue: z.number().int().min(0).nullable().optional(),
  maxDiscountInPaise: z.number().int().positive().nullable().optional(),
  benefitText: z.string().trim().max(250).nullable().optional(),
  applicableTo: z.enum(applicableTo),
  customerType: z.enum(customerTypes).optional().default('ALL'),
  customerSegment: z.string().trim().max(100).nullable().optional(),
  eligibilityText: z.string().trim().max(1000).nullable().optional(),
  minimumBookingInPaise: z.number().int().min(0).nullable().optional(),
  minimumStayNights: z.number().int().positive().nullable().optional(),
  minimumGuests: z.number().int().positive().nullable().optional(),
  advanceBookingDays: z.number().int().min(0).nullable().optional(),
  destinations: z.array(z.string().trim().min(1).max(100)).max(100).optional().default([]),
  packageTypes: z.array(z.enum(packageTypes)).max(30).optional().default([]),
  propertyTypes: z.array(z.enum(propertyTypes)).max(20).optional().default([]),
  packageIds: z.array(z.string().min(1)).max(500).optional().default([]),
  propertyIds: z.array(z.string().min(1)).max(500).optional().default([]),
  validFrom: isoDate,
  validTo: isoDate,
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().max(100).optional().default(1),
};

const checkOffer = (data, ctx) => {
  if (data.validTo <= data.validFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'validTo must be after validFrom' });
  }
  if (data.discountType === 'PERCENTAGE' && (!data.discountValue || data.discountValue > 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Percentage discountValue must be between 1 and 100' });
  }
  if (data.discountType === 'FLAT' && !data.discountValue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Flat discountValue must be a positive paise amount' });
  }
};

export const createOfferSchema = z.object(offerFields).strict().superRefine(checkOffer);

export const updateOfferSchema = z.object(offerFields).partial().strict();

export const listOffersQuerySchema = z.object({
  status: z.enum(statuses).optional(),
  discountType: z.enum(discountTypes).optional(),
  applicableTo: z.enum(applicableTo).optional(),
  search: z.string().trim().max(100).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'validFrom', 'validTo', 'name']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict().transform((query) => {
  const take = query.size ?? query.take ?? 20;
  const skip = query.page !== undefined ? query.page * take : (query.skip ?? 0);
  return { ...query, take, skip };
});

export const publicOffersQuerySchema = z.object({
  applicableTo: z.enum(['PACKAGE', 'PROPERTY']).optional(),
  take: z.coerce.number().int().min(1).max(100).optional().default(20),
  skip: z.coerce.number().int().min(0).optional().default(0),
}).strict();

const bookingItemSchema = z.object({
  roomId: z.string().min(1),
  unitsBooked: z.coerce.number().int().min(1).max(20).default(1),
}).strict();

export const validateCouponSchema = z.object({
  couponCode: z.string().trim().min(3).max(50).transform((value) => value.toUpperCase()),
  productType: z.enum(['PROPERTY', 'PACKAGE']),
  propertyId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  checkIn: isoDate.optional(),
  checkOut: isoDate.optional(),
  items: z.array(bookingItemSchema).min(1).max(20).optional(),
  numGuests: z.coerce.number().int().min(1).max(100).optional().default(1),
}).strict().superRefine((data, ctx) => {
  if (data.productType === 'PROPERTY' && (!data.propertyId || !data.checkIn || !data.checkOut || !data.items)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'propertyId, checkIn, checkOut and items are required for PROPERTY' });
  }
  if (data.productType === 'PACKAGE' && !data.packageId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packageId'], message: 'packageId is required for PACKAGE' });
  }
  if (data.checkIn && data.checkOut && data.checkOut <= data.checkIn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checkOut'], message: 'checkOut must be after checkIn' });
  }
});
