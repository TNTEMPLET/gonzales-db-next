import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  getDefaultAllStarCutoffMonthDayForOrg,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

function parseSeasonYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

function defaultCutoffDateForSeason(organizationId: ContentOrgId, seasonYear: number) {
  const { month, day } = getDefaultAllStarCutoffMonthDayForOrg(organizationId);
  return new Date(Date.UTC(seasonYear, month - 1, day, 0, 0, 0, 0));
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const seasonYear = parseSeasonYear(request.nextUrl.searchParams.get("seasonYear"));
  if (!seasonYear) {
    return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
  }
  const existing = await prisma.teamAllStarAgeCutoff.findUnique({
    where: {
      organizationId_seasonYear: {
        organizationId: targetOrg,
        seasonYear,
      },
    },
  });
  const cutoffDate =
    existing?.cutoffDate ?? defaultCutoffDateForSeason(targetOrg, seasonYear);
  return NextResponse.json({
    data: {
      organizationId: targetOrg,
      seasonYear,
      cutoffDate: cutoffDate.toISOString(),
      isDefault: !existing,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { seasonYear?: number; cutoffDate?: string };
  const seasonYear =
    typeof body.seasonYear === "number" && Number.isInteger(body.seasonYear)
      ? body.seasonYear
      : null;
  if (!seasonYear || seasonYear < 2020 || seasonYear > 2100) {
    return NextResponse.json({ error: "Valid seasonYear is required" }, { status: 400 });
  }
  const parsedDate = body.cutoffDate ? new Date(body.cutoffDate) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Valid cutoffDate is required" }, { status: 400 });
  }
  const upserted = await prisma.teamAllStarAgeCutoff.upsert({
    where: {
      organizationId_seasonYear: {
        organizationId: targetOrg,
        seasonYear,
      },
    },
    update: { cutoffDate: parsedDate },
    create: {
      organizationId: targetOrg,
      seasonYear,
      cutoffDate: parsedDate,
    },
  });
  return NextResponse.json({
    success: true,
    data: {
      organizationId: upserted.organizationId,
      seasonYear: upserted.seasonYear,
      cutoffDate: upserted.cutoffDate.toISOString(),
    },
  });
}
