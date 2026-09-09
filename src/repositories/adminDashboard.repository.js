import prisma from '../config/db.js';

export const getDashboardStats = async () => {
  const [totalLeads, totalAgents, totalCustomers, totalTravelAgents, totalPropertyOwners] =
    await prisma.$transaction([
      prisma.lead.count(),
      prisma.vendorProfile.count(),
      prisma.user.count({ where: { role: 'CLIENT' } }),
      prisma.vendorProfile.count({ where: { vendorType: 'TRAVEL_AGENT' } }),
      prisma.vendorProfile.count({ where: { vendorType: 'PROPERTY_OWNER' } }),
    ]);

  return {
    totalLeads,
    totalAgents,
    totalCustomers,
    totalTravelAgents,
    totalPropertyOwners,
  };
};
