import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import { parseSeasonYear } from "@/lib/allStar/server";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

function sortAgeBand(a: string, b: string) {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  if (Number.isFinite(numA)) return -1;
  if (Number.isFinite(numB)) return 1;
  return a.localeCompare(b);
}

function normalizeAgeBand(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const parsedSeason = parseSeasonYear(request.nextUrl.searchParams.get("seasonYear"));
  const seasonYear = parsedSeason ?? new Date().getFullYear();

  const rows = await prisma.teamPlayer.findMany({
    where: {
      allStarAgeBand: { not: null },
      team: {
        organizationId: org,
        seasonYear,
      },
    },
    select: { allStarAgeBand: true },
    distinct: ["allStarAgeBand"],
  });

  const discoveredAgeGroups = rows
    .map((row) => normalizeAgeBand(String(row.allStarAgeBand || "")))
    .filter((value): value is string => Boolean(value))
    .sort(sortAgeBand);

  const ageGroups = discoveredAgeGroups;

  return NextResponse.json({
    data: ageGroups.map((label) => ({ id: label, label })),
  });
}
