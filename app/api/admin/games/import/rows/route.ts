import { NextRequest, NextResponse } from "next/server";

import { mapDraftsToAssignrRows } from "@/lib/assignr/gamesImportCsv";
import {
  parseJsonRecord,
  parseSeasonYear,
} from "@/lib/assignr/gamesImportService";
import { parseTournamentScheduleBuffer } from "@/lib/assignr/tournamentScheduleParser";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const organizationId = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const seasonYear = parseSeasonYear(formData.get("seasonYear"));
    const ageGroupMappings = parseJsonRecord(formData.get("ageGroupMappings"));
    const contentOrgMappings = parseJsonRecord(formData.get("contentOrgMappings"));
    const parkMappings = parseJsonRecord(formData.get("parkMappings"));
    const fieldMappings = parseJsonRecord(formData.get("fieldMappings"));
    const league = String(formData.get("league") || "").trim();
    const leagueByOrg = parseJsonRecord(formData.get("leagueByOrg"));
    const gameType = String(formData.get("gameType") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV or XLSX file is required" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const drafts = parseTournamentScheduleBuffer(buffer, seasonYear);
    if (drafts.length === 0) {
      return NextResponse.json(
        { error: "No tournament games were detected in the uploaded file" },
        { status: 400 },
      );
    }

    const mapped = mapDraftsToAssignrRows(
      drafts,
      {
        ageGroupMappings,
        contentOrgMappings,
        parkMappings,
        fieldMappings,
        league,
        leagueByOrg,
        gameType,
      },
      seasonYear,
    );

    const rows = mapped.filter((entry) => !entry.skipped).map((entry) => entry.row);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No mapped rows are ready to publish" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      organizationId,
      seasonYear,
      rows,
      skippedCount: mapped.filter((entry) => entry.skipped).length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to build publish rows: ${message}` },
      { status: 500 },
    );
  }
}
