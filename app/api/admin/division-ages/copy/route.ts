import { NextRequest, NextResponse } from "next/server";

import { copyFromSeason } from "@/lib/ageDivisions/store";

import { guardDivisionAges, readSeasonYear } from "../guard";

function readBaselineToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { baselineToken?: unknown }).baselineToken;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  return trimmed;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readYear(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1990 || value > 2200) return null;
  return value;
}

export async function POST(request: NextRequest) {
  const guard = await guardDivisionAges(request, true);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as {
    fromSeasonYear?: unknown;
    toSeasonYear?: unknown;
  } | null;
  const toSeasonYear = readYear(body?.toSeasonYear) ?? readSeasonYear(request);
  const fromSeasonYear = readYear(body?.fromSeasonYear) ?? (toSeasonYear == null ? null : toSeasonYear - 1);
  if (toSeasonYear == null || fromSeasonYear == null) {
    return NextResponse.json({ error: "fromSeasonYear and toSeasonYear must be four-digit years." }, { status: 400 });
  }
  try {
    const copied = await copyFromSeason(
      guard.org,
      fromSeasonYear,
      toSeasonYear,
      guard.adminId,
      readBaselineToken(body),
    );
    if (!copied.ok) {
      return NextResponse.json({ error: copied.error, issues: copied.issues ?? [] }, { status: copied.status });
    }
    return NextResponse.json({
      organizationId: guard.org,
      seasonYear: toSeasonYear,
      fromSeasonYear,
      canEdit: true,
      ...copied.value,
    });
  } catch (error) {
    console.error("[division-ages] copy from season failed", error);
    return NextResponse.json({ error: "Could not copy division ages." }, { status: 500 });
  }
}
