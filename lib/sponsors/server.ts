import prisma from "@/lib/prisma";
import { type ContentOrgId } from "@/lib/siteConfig";

export type SponsorScrollerItem = {
  sponsorId: string;
  businessName: string;
  logoUrl: string;
  logoAlt: string;
  websiteUrl: string | null;
  sortOrder: number;
};

export async function getActiveSponsorScrollerItems(
  organizationId: ContentOrgId,
) {
  const now = new Date();
  const placements = await prisma.sponsorPlacement.findMany({
    where: {
      organizationId,
      showInFooterScroller: true,
      sponsor: {
        isActive: true,
        logoUrl: { not: null },
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
    },
    include: {
      sponsor: {
        select: {
          id: true,
          businessName: true,
          logoUrl: true,
          logoAlt: true,
          websiteUrl: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return placements
    .filter((entry) => Boolean(entry.sponsor.logoUrl))
    .map<SponsorScrollerItem>((entry) => ({
      sponsorId: entry.sponsor.id,
      businessName: entry.sponsor.businessName,
      logoUrl: entry.sponsor.logoUrl || "",
      logoAlt:
        entry.sponsor.logoAlt ||
        `${entry.sponsor.businessName} sponsor logo`,
      websiteUrl: entry.sponsor.websiteUrl,
      sortOrder: entry.sortOrder,
    }));
}
