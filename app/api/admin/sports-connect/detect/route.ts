import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  detectSportsConnectReport,
  headersFromRow,
} from "@/lib/sportsConnect/columnProfiles";
import { SPORTS_CONNECT_REPORT_CATALOG } from "@/lib/sportsConnect/reportCatalog";

export const dynamic = "force-dynamic";

/**
 * Score CSV/XLSX header row against known SportsConnect export profiles.
 * Body: { headers: string[] } or { row: Record<string, unknown> }
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  let body: { headers?: unknown; row?: unknown };
  try {
    body = (await request.json()) as { headers?: unknown; row?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let headers: string[] = [];
  if (Array.isArray(body.headers)) {
    headers = body.headers.map((h) => String(h ?? "").trim()).filter(Boolean);
  } else if (body.row && typeof body.row === "object") {
    headers = headersFromRow(body.row as Record<string, unknown>);
  }

  if (headers.length === 0) {
    return NextResponse.json(
      { error: "headers or row with columns is required" },
      { status: 400 },
    );
  }

  const detection = detectSportsConnectReport(headers);
  return NextResponse.json(
    {
      data: detection,
      catalog: SPORTS_CONNECT_REPORT_CATALOG,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  return NextResponse.json(
    { catalog: SPORTS_CONNECT_REPORT_CATALOG },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
