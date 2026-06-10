import { ApiError } from '../../utils/ApiError.js';
import * as leadRepo from '../../repositories/lead.repository.js';

/**
 * Split the incoming wizard payload into:
 *   - Top-level relational columns (destination/email/phone/budget)
 *   - A `requirements` JSONB blob for everything else.
 *
 * Anything not explicitly destructured into a top-level column ends up in
 * the JSONB blob unchanged - this is the "hybrid data" strategy.
 */
const splitLeadPayload = (form) => {
  const {
    destination,
    email,
    phone,
    budget,
    ...requirements
  } = form;

  return {
    top: {
      destination,
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
