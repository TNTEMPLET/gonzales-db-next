import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";
import { getSiteConfigForOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/**
 * Org → league (age group) → team names for coach account setup.
 * League = age division label stored on `Team.ageGroup` (e.g. 6U LLB).
 */
export async function GET(request: NextRequest) {
  const rawYear = request.nextUrl.searchParams.get("seasonYear");
  const seasonYear = rawYear
    ? Number.parseInt(rawYear, 10)
    : new Date().getFullYear();
  if (!Number.isFinite(seasonYear)) {
    return NextResponse.json({ error: "Invalid seasonYear" }, { status: 400 });
  }

  const rows = await prisma.team.findMany({
    where: { seasonYear },
    select: { organizationId: true, ageGroup: true, teamName: true },
    orderBy: [{ organizationId: "asc" }, { ageGroup: "asc" }, { teamName: "asc" }],
  });

  const tree: Record<string, Record<string, string[]>> = {};

  for (const row of rows) {
    if (row.organizationId !== "gonzales" && row.organizationId !== "ascension") {
      continue;
    }
    const org = row.organizationId;
    const league = row.ageGroup.trim();
    const team = row.teamName.trim();
    if (!league || !team) continue;

    if (!tree[org]) tree[org] = {};
    if (!tree[org][league]) tree[org][league] = [];
    const list = tree[org][league];
    if (!list.includes(team)) list.push(team);
  }

  const orgIds = Object.keys(tree).sort() as ContentOrgId[];
  const organizations = orgIds.map((id) => ({
    id,
    displayName: getSiteConfigForOrg(id).name,
    shortName: getSiteConfigForOrg(id).shortName,
  }));

  return NextResponse.json({ seasonYear, organizations, tree });
}
