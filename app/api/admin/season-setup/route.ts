import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import {
  getSeasonSetupChecklist,
  isManualChecklistItemKey,
} from "@/lib/admin/seasonSetup/checklist";
import { isContentOrgId } from "@/lib/siteConfig";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SEASON_SETUP");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(seasonYear)) {
    return NextResponse.json({ error: "Invalid seasonYear" }, { status: 400 });
  }

  const checklist = await getSeasonSetupChecklist(targetOrg, seasonYear);
  return NextResponse.json(checklist);
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SEASON_SETUP");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { seasonYear, itemKey, ageGroup, isComplete } = body as {
    seasonYear?: number;
    itemKey?: string;
    ageGroup?: string | null;
    isComplete?: boolean;
  };

  if (!Number.isFinite(seasonYear) || !itemKey || typeof isComplete !== "boolean") {
    return NextResponse.json(
      { error: "seasonYear, itemKey, and isComplete are required" },
      { status: 400 },
    );
  }
  if (!isManualChecklistItemKey(itemKey)) {
    return NextResponse.json(
      { error: `"${itemKey}" is not a manually-completable checklist item` },
      { status: 400 },
    );
  }

  const normalizedAgeGroup = ageGroup?.trim() || "";

  const item = await prisma.seasonSetupChecklistItem.upsert({
    where: {
      organizationId_seasonYear_itemKey_ageGroup: {
        organizationId: targetOrg,
        seasonYear: seasonYear as number,
        itemKey,
        ageGroup: normalizedAgeGroup,
      },
    },
    create: {
      organizationId: targetOrg,
      seasonYear: seasonYear as number,
      itemKey,
      ageGroup: normalizedAgeGroup,
      isComplete,
      completedByAdminId: isComplete ? auth.admin.id : null,
      completedAt: isComplete ? new Date() : null,
    },
    update: {
      isComplete,
      completedByAdminId: isComplete ? auth.admin.id : null,
      completedAt: isComplete ? new Date() : null,
    },
  });

  return NextResponse.json({ item });
}
