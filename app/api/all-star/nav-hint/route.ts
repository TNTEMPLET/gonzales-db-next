import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

/**
 * GET /api/all-star/nav-hint
 * Returns { showAllStarLink: boolean } — used by the public Header to decide whether
 * to show the "All-Stars" nav item. True when the org has a PayPal link configured
 * OR has any payment records (meaning rosters have been published).
 */
export async function GET() {
  const site = getSiteConfig();
  const orgId = site.orgId === "ascension" ? "ascension" : "gonzales";

  const [config, hasPayments] = await Promise.all([
    prisma.allStarPageConfig.findUnique({
      where: { organizationId: orgId },
      select: { paypalLinkUrl: true },
    }),
    prisma.allStarPayment.findFirst({
      where: { organizationId: orgId },
      select: { id: true },
    }),
  ]);

  const showAllStarLink = !!(config?.paypalLinkUrl || hasPayments);

  return NextResponse.json({ showAllStarLink });
}
