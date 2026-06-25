import * as adminLeadService from '../services/adminLead/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listLeads = asyncHandler(async (req, res) => {
  const data = await adminLeadService.listLeadsForAdmin(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Leads retrieved.',
    data,
  });
});

export const getLeadDetail = asyncHandler(async (req, res) => {
  const data = await adminLeadService.getLeadDetailForAdmin(req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Lead retrieved.',
    data,
  });
});

/**
 * Single status-change endpoint. Dispatches to approve / reject / close
 * based on the `status` field in the body. The 3 service functions are kept
 * separate internally because they have distinct side effects + audit logs.
 */
export const updateLeadStatus = asyncHandler(async (req, res) => {
  const { status, reason, priceInCredits, maxUnlocks } = req.body;
  const leadId = req.params.id;
  const adminId = req.user.id;

  let data;
  let message;

  switch (status) {
    case 'ACTIVE': {
      data = await adminLeadService.approveLead({
        leadId,
        adminId,
        priceInCredits,
        maxUnlocks,
      });
      message = 'Lead approved. Now visible in the marketplace.';
      break;
    }
    case 'REJECTED': {
      data = await adminLeadService.rejectLead({ leadId, adminId, reason });
      message = 'Lead rejected.';
      break;
    }
    case 'CLOSED': {
      data = await adminLeadService.closeLead({ leadId, adminId, reason });
      message = 'Lead closed. Removed from the marketplace.';
      break;
    }
    default:
      // Zod schema should have caught this; defensive fallback only.
      message = 'Unknown status transition.';
  }

  return sendSuccess(res, { statusCode: 200, message, data });
});

export const updateLeadPricing = asyncHandler(async (req, res) => {
  const { priceInCredits, maxUnlocks } = req.body;
  const data = await adminLeadService.updateLeadPricing({
    leadId: req.params.id,
    adminId: req.user.id,
    priceInCredits,
    maxUnlocks,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Lead pricing updated.',
    data,
  });
});
