import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  previewSportsConnectFile,
  previewSportsConnectFiles,
  type SportsConnectFilePreviewInput,
} from "@/lib/sportsConnect/preview";

export const dynamic = "force-dynamic";

/**
 * Multi-file SportsConnect preview: detect report kinds and build load-order plan.
 * Body: { files: [{ fileName, headers?, rows? }] } or single { fileName, headers?, rows? }
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  let body: {
    files?: unknown;
    fileName?: unknown;
    headers?: unknown;
    rows?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const files: SportsConnectFilePreviewInput[] = [];

  if (Array.isArray(body.files)) {
    for (const item of body.files) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      files.push({
        fileName:
          typeof row.fileName === "string" ? row.fileName : "upload",
        headers: Array.isArray(row.headers)
          ? row.headers.map((h) => String(h ?? "").trim()).filter(Boolean)
          : undefined,
        rows: Array.isArray(row.rows)
          ? (row.rows as Array<Record<string, unknown>>)
          : undefined,
      });
    }
  } else if (
    body.headers ||
    body.rows ||
    typeof body.fileName === "string"
  ) {
    files.push({
      fileName:
        typeof body.fileName === "string" ? body.fileName : "upload",
      headers: Array.isArray(body.headers)
        ? body.headers.map((h) => String(h ?? "").trim()).filter(Boolean)
        : undefined,
      rows: Array.isArray(body.rows)
        ? (body.rows as Array<Record<string, unknown>>)
        : undefined,
    });
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "files array or headers/rows is required" },
      { status: 400 },
    );
  }

  if (files.length === 1 && !Array.isArray(body.files)) {
    return NextResponse.json(
      { data: previewSportsConnectFile(files[0]!) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(
    { data: previewSportsConnectFiles(files) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
