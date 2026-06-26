import { z } from 'zod';

// ----------------------------------------------------------------------------
//   GET /marketplace/leads — vendor browse filters
// ----------------------------------------------------------------------------
//
// Vendor's "find a lead worth buying" surface. Deliberately leaner than the
// admin filters (no reviewedBy / unlockCount internals) — just what a working
// sales person needs to decide which lead to spend credits on.
//
// Supports:
//   - Text search:  search, destination
//   - Money filters: budgetMin/Max (customer's budget), priceMin/Max (cost to vendor)
//   - Freshness:    createdFrom / createdTo
//   - Exclude already-bought: excludeUnlocked=true (hide leads this vendor unlocked)
//   - Sort:         createdAt | priceInCredits | budget
//   - Pagination:   take+skip OR page+size
// ----------------------------------------------------------------------------
const isoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'Invalid date (use ISO-8601, e.g. 2026-06-01)',
  });

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const browseLeadsQuerySchema = z
  .object({
    // ---- Text search ----
    search: z.string().trim().max(100).optional(),
    destination: z.string().trim().min(1).max(120).optional(),

    // ---- Top-level filter — departure city (indexed, case-insensitive contains) ----
    // Now a normal column (was JSONB until 2026-06-26 migration). Any casing OK.
    departureCity: z.string().trim().min(1).max(120).optional(),

    // ---- Travel date range — find leads with travel happening in a window ----
    // ISO-8601 date or date-time. E.g. "next 30 days" = travelFrom=today.
    travelFrom: isoDate.optional(),
    travelTo: isoDate.optional(),

    // ---- Customer's budget filters (INR) — find high-value leads ----
    budgetMin: z.coerce.number().int().min(0).optional(),
    budgetMax: z.coerce.number().int().min(0).optional(),

    // ---- Cost-to-vendor filters (credits) — match vendor's spending appetite ----
    priceMin: z.coerce.number().int().min(0).max(1000).optional(),
    priceMax: z.coerce.number().int().min(0).max(1000).optional(),

    // ---- Freshness — vendors usually want recent leads ----
    createdFrom: isoDate.optional(),
    createdTo: isoDate.optional(),

    // ---- Hide leads this vendor already bought ----
    excludeUnlocked: boolFromString.optional(),

    // ---- Pagination (dual style) ----
    take: z.coerce.number().int().min(1).max(50).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(50).optional(),

    // ---- Sorting ----
    sortBy: z
      .enum(['createdAt', 'travelDate', 'priceInCredits', 'budget'])
      .optional()
      .default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return {
      search: q.search,
      destination: q.destination,
      departureCity: q.departureCity,
      travelFrom: q.travelFrom ? new Date(q.travelFrom) : undefined,
      travelTo: q.travelTo ? new Date(q.travelTo) : undefined,
      budgetMin: q.budgetMin,
      budgetMax: q.budgetMax,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      createdFrom: q.createdFrom ? new Date(q.createdFrom) : undefined,
      createdTo: q.createdTo ? new Date(q.createdTo) : undefined,
      excludeUnlocked: q.excludeUnlocked ?? false,
      sortBy: q.sortBy,
      order: q.order,
      take,
      skip,
    };
  });
