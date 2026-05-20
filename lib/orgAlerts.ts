import prisma from "@/lib/prisma";

export async function getActiveOrgAlert(organizationId: string) {
  return prisma.orgAlert.findFirst({
    where: {
      organizationId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllActiveOrgAlerts() {
  return prisma.orgAlert.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
  });
}

export async function getRecentOrgAlerts(organizationId: string, limit = 5) {
  return prisma.orgAlert.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
