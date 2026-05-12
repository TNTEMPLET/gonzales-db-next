import { NextRequest, NextResponse } from "next/server";

import {
  buildAssignrGamesCsvFromDrafts,
  mapDraftsToAssignrRows,
} from "@/lib/assignr/gamesImportCsv";
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

  resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

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
    const includeUnmapped = String(formData.get("includeUnmapped") || "false")
      .trim()
      .toLowerCase() === "true";

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

    const { csv, exportedCount, skippedCount } = buildAssignrGamesCsvFromDrafts(
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
      { includeUnmapped },
    );

    if (exportedCount === 0) {
      return NextResponse.json(
        {
          error:
            "No rows were exported. Complete age group, venue, and field mappings first.",
          skippedCount,
        },
        { status: 400 },
      );
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="assignr-games-import.csv"',
        "X-Export-Count": String(exportedCount),
        "X-Skipped-Count": String(skippedCount),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to export tournament import: ${message}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as {
      drafts?: unknown;
      seasonYear?: number;
      ageGroupMappings?: Record<string, string>;
      parkMappings?: Record<string, string>;
      fieldMappings?: Record<string, string>;
      league?: string;
      gameType?: string;
    };

    const drafts = Array.isArray(body.drafts) ? body.drafts : [];
    const seasonYear = parseSeasonYear(
      body.seasonYear ? String(body.seasonYear) : null,
    );
    const ageGroupMappings = body.ageGroupMappings ?? {};
    const parkMappings = body.parkMappings ?? {};
    const fieldMappings = body.fieldMappings ?? {};

    const mapped = mapDraftsToAssignrRows(
      drafts as Parameters<typeof mapDraftsToAssignrRows>[0],
      {
        ageGroupMappings,
        parkMappings,
        fieldMappings,
        league: body.league,
        gameType: body.gameType,
      },
      seasonYear,
    );

    return NextResponse.json({
      rows: mapped.map((entry) => entry.row),
      warnings: mapped.map((entry) => ({
        warnings: entry.warnings,
        skipped: entry.skipped,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to normalize tournament import rows: ${message}` },
      { status: 500 },
    );
  }
}
