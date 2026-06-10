import { z } from 'zod';

// "Yes"/"No"/true/false/"" -> boolean (empty -> false)
const yesNoBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .default(false)
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  });

// "2"/2/"" -> int (empty/invalid -> 0)
const intStr = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  });

// budget: "" -> null, "25000" -> 25000, 25000 -> 25000
const budgetField = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  });

// Customer-facing payload is wrapped: { lead: { ... } }
export const submitLeadSchema = z.object({
  lead: z
    .object({
      // ---- Top-level relational fields ----
      destination:   z.string().trim().min(1, 'Destination is required').max(120),
      email:         z.string().trim().toLowerCase().email('Invalid email').max(200),
      phone:         z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone'),
      budget:        budgetField,

      // ---- Everything else lands in `requirements` (JSONB) ----
      departureCity:     z.string().trim().max(120).optional().default(''),
      travelDate:        z.string().trim().max(40).optional().default(''),
      duration:          z.string().trim().max(60).optional().default(''),
      ticketsBooked:     z.boolean().optional().default(false),
      whatsappUpdates:   z.boolean().optional().default(false),
      hotelCategory:     z.string().trim().max(40).optional().default(''),
      flightRequired:    yesNoBool,
      adults:            intStr,
      infants:           intStr,
      children:          intStr,
      bookingTimeline:   z.string().trim().max(60).optional().default(''),
      cabRequired:       yesNoBool,
      packageType:       z.string().trim().max(60).optional().default(''),
      preferredCallTime: z.string().trim().max(60).optional().default(''),
      otherDestinations: yesNoBool,
      tourType:          z.string().trim().max(60).optional().default(''),
    })
    .passthrough(), // tolerate extra fields without crashing
});
