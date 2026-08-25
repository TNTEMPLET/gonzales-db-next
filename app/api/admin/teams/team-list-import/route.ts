import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import {
  buildTeamListPreviewRows,
  runTeamListImport,
  summarizeTeamListRows,
} from "@/lib/sportsConnect/teamListPreview";

type TeamListImportMode = "preview" | "import";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as {
    mode?: TeamListImportMode;
    seasonYear?: number | string;
    csvText?: string;
  };

  const mode = body.mode === "import" ? "import" : "preview";
  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const csvText = typeof body.csvText === "string" ? body.csvText : "";

  if (!seasonYear) {
    return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  if (mode === "preview") {
    const rows = await buildTeamListPreviewRows({
      targetOrg,
      seasonYear,
      source: { kind: "csvText", csvText },
    });
    const summary = summarizeTeamListRows(rows);
    return NextResponse.json({ success: true, mode, seasonYear, rows, summary });
  }

  const result = await runTeamListImport({
    targetOrg,
    seasonYear,
    source: { kind: "csvText", csvText },
    adminId: admin?.id || null,
    adminEmail: admin?.email || null,
  });

  if (result.summary.errors > 0) {
    return NextResponse.json(
      {
        error: "Fix row errors before importing team list.",
        mode,
        seasonYear,
        rows: result.rows,
        summary: result.summary,
      },
      { status: 400 },
    );
  }

  const affectedTeams = [...result.createdTeamIds, ...result.updatedTeamIds].map((id) => ({ id }));

  return NextResponse.json({
    success: true,
    mode,
    seasonYear,
    rows: result.rows,
    summary: { ...result.summary, affected: affectedTeams.length },
    affectedTeams,
    importBatchId: result.batchId,
  });
}
