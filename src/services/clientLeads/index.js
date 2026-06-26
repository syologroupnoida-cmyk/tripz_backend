// Client (customer)-facing lead service. Only deals with the LOGGED-IN
// customer's own leads — never returns vendor identities or unlock pricing
// secrets they shouldn't see.

import * as leadRepo from '../../repositories/lead.repository.js';

/**
 * List the customer's own leads (anonymous claimed + authenticated submissions).
 *
 * The customer sees their own inquiry data plus how many vendors have
 * unlocked it — but NOT which vendors specifically (privacy + monetisation:
 * vendors paid for the contact info, they own that relationship).
 */
export const listMyLeads = async ({ customerUserId, query }) => {
  const { items, total } = await leadRepo.listLeadsByCustomer({
    customerUserId,
    take: query.take,
    skip: query.skip,
  });
  return { items, total, take: query.take, skip: query.skip };
};
