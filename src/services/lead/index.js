import { ApiError } from '../../utils/ApiError.js';
import * as leadRepo from '../../repositories/lead.repository.js';

/**
 * Split the incoming wizard payload into:
 *   - Top-level relational columns (destination/departureCity/travelDate/email/phone/budget)
 *   - A `requirements` JSONB blob for everything else.
 *
 * Anything not explicitly destructured into a top-level column ends up in
 * the JSONB blob unchanged — this is the "hybrid data" strategy.
 *
 * `travelDate` arrives as a string from the form; we try to parse it to a
 * Date here. Unparseable / empty → null. Bad input never crashes the request.
 */
const parseTravelDate = (raw) => {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
};

const splitLeadPayload = (form) => {
  const {
    destination,
    departureCity,
    travelDate,
    email,
    phone,
    budget,
    ...requirements
  } = form;

  return {
    top: {
      destination,
      departureCity:
        typeof departureCity === 'string' && departureCity.trim() !== ''
          ? departureCity.trim()
          : null,
      travelDate: parseTravelDate(travelDate),
      email,
      phone,
      budget, // already normalized to Int | null by the validator
    },
    requirements,
  };
};

export const submitLead = async ({ payload, customerUserId = null }) => {
  if (!payload?.lead) {
    throw ApiError.badRequest('Missing `lead` payload.');
  }

  const { top, requirements } = splitLeadPayload(payload.lead);

  const lead = await leadRepo.createLead({
    ...top,
    customerUserId,
    requirements,
  });

  return {
    leadId: lead.id,
    status: lead.status,
    createdAt: lead.createdAt,
    message:
      'Thanks! Your inquiry has been received and is being reviewed. ' +
      'Verified vendors will reach out once it is approved.',
  };
};
