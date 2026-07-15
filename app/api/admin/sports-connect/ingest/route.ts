import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  isSportsConnectIngestConfigured,
  isValidSportsConnectIngestBearer,
} from "@/lib/sportsConnect/ingestAuth";
import { ingestSportsConnectExport } from "@/lib/sportsConnect/ingest";
import {
  isContentOrgId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * n8n / automation ingest for SportsConnect exports (Option D).
 *
 * Auth (either):
 * - Authorization: Bearer <SPORTS_CONNECT_INGEST_SECRET>
 * - Admin session with TEAMS module (manual testing)
 *
 * Body: multipart form fields:
 *   file (required), org (required), seasonYear (optional)
 *
 * Or JSON:
 *   { org, seasonYear?, fileName, contentBase64 }
 *
 * Never writes rosters — detect/preview + optional PREVIEW audit run only.
 */
async function authorizeIngest(request: NextRequest): Promise<
  | { ok: true; via: "bearer" | "session" }
  | { ok: false; status: number; error: string }
> {
  if (isValidSportsConnectIngestBearer(request)) {
    return { ok: true, via: "bearer" };
  }

  if (isSportsConnectIngestConfigured()) {
    // Secret is configured: require it for non-session callers.
    const auth = await ensureAdminModule(request, "TEAMS");
    if (auth.ok) return { ok: true, via: "session" };
    return {
      ok: false,
      status: 401,
      error: "Unauthorized — use Bearer SPORTS_CONNECT_INGEST_SECRET or admin session",
    };
  }

  // Secret not configured: allow admin session only (local/dev).
  const auth = await ensureAdminModule(request, "TEAMS");
  if (auth.ok) return { ok: true, via: "session" };
  return {
    ok: false,
    status: 503,
    error:
      "SportsConnect ingest is not configured (set SPORTS_CONNECT_INGEST_SECRET) and no admin session.",
  };
}

function resolveOrg(
  request: NextRequest,
  bodyOrg?: unknown,
): string | null {
  const fromQuery = request.nextUrl.searchParams.get("org");
  const fromBody = typeof bodyOrg === "string" ? bodyOrg : null;
  const raw = fromBody || fromQuery;
  const resolved = resolveAdminTargetOrg(raw);
  return isContentOrgId(resolved) ? resolved : null;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeIngest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const orgRaw = form.get("org");
      const seasonRaw = form.get("seasonYear");
      const organizationId = resolveOrg(
        request,
        typeof orgRaw === "string" ? orgRaw : undefined,
      );
      if (!organizationId) {
        return NextResponse.json(
          {
            error:
              "org is required and must be fallball, gonzales, or ascension (never All Sites).",
          },
          { status: 400 },
        );
      }
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "multipart field file is required" },
          { status: 400 },
        );
      }
      const seasonYear =
        typeof seasonRaw === "string" && seasonRaw.trim()
          ? Number(seasonRaw)
          : undefined;
      const buffer = await file.arrayBuffer();
      const result = await ingestSportsConnectExport({
        organizationId,
        seasonYear,
        fileName: file.name || "export.csv",
        buffer,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }
      return NextResponse.json(
        { data: result.data, authVia: auth.via },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    let body: {
      org?: unknown;
      seasonYear?: unknown;
      fileName?: unknown;
      contentBase64?: unknown;
      recordPreviewRun?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Expected multipart/form-data or JSON body" },
        { status: 400 },
      );
    }

    const organizationId = resolveOrg(request, body.org);
    if (!organizationId) {
      return NextResponse.json(
        {
          error:
            "org is required and must be fallball, gonzales, or ascension (never All Sites).",
        },
        { status: 400 },
      );
    }
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "export.csv";
    const b64 =
      typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
    if (!b64) {
      return NextResponse.json(
        { error: "contentBase64 is required for JSON ingest" },
        { status: 400 },
      );
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return NextResponse.json(
        { error: "Invalid contentBase64" },
        { status: 400 },
      );
    }
    const seasonYear = Number.isFinite(Number(body.seasonYear))
      ? Number(body.seasonYear)
      : undefined;
    const result = await ingestSportsConnectExport({
      organizationId,
      seasonYear,
      fileName,
      buffer,
      recordPreviewRun: body.recordPreviewRun !== false,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(
      { data: result.data, authVia: auth.via },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "SportsConnect ingest failed";
    console.error("[sports-connect/ingest]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeIngest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }
  return NextResponse.json(
    {
      data: {
        configured: isSportsConnectIngestConfigured(),
        authVia: auth.via,
        accepts: ["multipart/form-data (file, org, seasonYear)", "application/json (org, fileName, contentBase64)"],
        writesRosters: false,
        maxBytes: 15 * 1024 * 1024,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
