import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import {
  defaultParishRegistrationFeeCents,
  resolveParishRegistrationFeeCents,
} from "@/lib/admin/parishEnrollmentMoney";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

function parseSeasonYear(value: unknown, fallback: number): number | null {
  const year = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : fallback;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseDollarsToCents(value: unknown): number | null | "invalid" {
  if (value == null || value === "") return null;
  const dollars =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[$,]/g, "").trim())
        : NaN;
  if (!Number.isFinite(dollars) || dollars <= 0) return "invalid";
  return Math.round(dollars * 100);
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SEASON_SETUP");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }

  const seasonYear = parseSeasonYear(
    request.nextUrl.searchParams.get("seasonYear"),
    getSeasonConfigForOrg(targetOrg).year,
  );
  if (seasonYear == null) {
    return NextResponse.json({ error: "Invalid seasonYear" }, { status: 400 });
  }

  const stored = await prisma.seasonOrgSettings.findUnique({
    where: { organizationId_seasonYear: { organizationId: targetOrg, seasonYear } },
    select: { parishRegistrationFeeCents: true },
  });
  const fallback = defaultParishRegistrationFeeCents(targetOrg);
  return NextResponse.json({
    organizationId: targetOrg,
    seasonYear,
    parishRegistrationFeeCents: stored?.parishRegistrationFeeCents ?? null,
    defaultParishRegistrationFeeCents: fallback,
    effectiveParishRegistrationFeeCents: resolveParishRegistrationFeeCents({
      organizationId: targetOrg,
      storedCents: stored?.parishRegistrationFeeCents,
    }),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SEASON_SETUP");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seasonYear?: unknown;
    parishRegistrationFeeDollars?: unknown;
  };
  const seasonYear = parseSeasonYear(body.seasonYear, getSeasonConfigForOrg(targetOrg).year);
  if (seasonYear == null) {
    return NextResponse.json({ error: "Invalid seasonYear" }, { status: 400 });
  }

  if (!("parishRegistrationFeeDollars" in body)) {
    return NextResponse.json({ error: "parishRegistrationFeeDollars is required" }, { status: 400 });
  }
  const parsedFee = parseDollarsToCents(body.parishRegistrationFeeDollars);
  if (parsedFee === "invalid") {
    return NextResponse.json({ error: "Enter a registration fee in dollars, or leave it blank for the default" }, { status: 400 });
  }
  const parishRegistrationFeeCents = parsedFee;

  const row = await prisma.seasonOrgSettings.upsert({
    where: { organizationId_seasonYear: { organizationId: targetOrg, seasonYear } },
    create: {
      organizationId: targetOrg,
      seasonYear,
      parishRegistrationFeeCents,
    },
    update: { parishRegistrationFeeCents },
  });

  return NextResponse.json({
    organizationId: targetOrg,
    seasonYear,
    parishRegistrationFeeCents: row.parishRegistrationFeeCents,
    defaultParishRegistrationFeeCents: defaultParishRegistrationFeeCents(targetOrg),
    effectiveParishRegistrationFeeCents: resolveParishRegistrationFeeCents({
      organizationId: targetOrg,
      storedCents: row.parishRegistrationFeeCents,
    }),
  });
}
