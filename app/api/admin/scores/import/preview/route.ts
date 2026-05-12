import { NextRequest, NextResponse } from "next/server";

import {
  fetchAssignrGamesForScope,
  resolveAdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import {
  buildScoresImportPreview,
  parseScoresImportBuffer,
  SCORES_IMPORT_SEASON_END,
  SCORES_IMPORT_SEASON_START,
} from "@/lib/admin/scoresImportService";
import { ensureAdminModule } from "@/lib/news/auth";

export async function POST(request: NextRequest) {
  const scope = resolveAdminAssignrScope(
    request.nextUrl.searchParams.get("org"),
  );
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV or XLSX file is required" },
        { status: 400 },
      );
    }

    const rows = parseScoresImportBuffer(Buffer.from(await file.arrayBuffer()));
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file has no rows" },
        { status: 400 },
      );
    }

    const games = await fetchAssignrGamesForScope({
      startDate: SCORES_IMPORT_SEASON_START,
      endDate: SCORES_IMPORT_SEASON_END,
      scope,
    });

    const preview = buildScoresImportPreview({ rows, games });

    return NextResponse.json({
      scope,
      ...preview,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to preview scores import: ${message}` },
      { status: 500 },
    );
  }
}
