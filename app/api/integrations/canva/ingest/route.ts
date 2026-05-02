import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_IMAGE_MAX_BYTES,
  isBlobConfigStoreError,
  storeAdminImageBuffer,
  validateStrictImageContentType,
} from "@/lib/uploads/storeAdminImage";

export const runtime = "nodejs";

/**
 * Ingest a short-lived Canva export URL: fetch bytes server-side, store on Vercel Blob (or local uploads).
 *
 * Configure `CANVA_INGEST_SECRET`. Call from a Canva app (or any server) with:
 * `Authorization: Bearer <CANVA_INGEST_SECRET>` and JSON body `{ "exportUrl": "https://..." }`.
 */
function bearerToken(request: NextRequest): string | null {
  const h = request.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CANVA_INGEST_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Canva ingest is not configured (CANVA_INGEST_SECRET)." },
      { status: 503 },
    );
  }

  if (bearerToken(request) !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { exportUrl?: unknown };
  try {
    body = (await request.json()) as { exportUrl?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const exportUrl =
    typeof body.exportUrl === "string" ? body.exportUrl.trim() : "";
  if (!exportUrl) {
    return NextResponse.json({ error: "exportUrl is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(exportUrl);
  } catch {
    return NextResponse.json({ error: "Invalid exportUrl" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "exportUrl must be http(s)" }, { status: 400 });
  }

  try {
    const res = await fetch(exportUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch export: HTTP ${res.status}` },
        { status: 422 },
      );
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength != null && Number(contentLength) > ADMIN_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > ADMIN_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    const rawCt = res.headers.get("content-type");
    const contentType = rawCt?.split(";")[0]?.trim() || "";
    if (!validateStrictImageContentType(contentType)) {
      return NextResponse.json(
        {
          error:
            "Response must be a supported image (JPEG, PNG, WebP, GIF, or SVG).",
        },
        { status: 422 },
      );
    }

    const stored = await storeAdminImageBuffer({
      buffer: buf,
      contentType,
      target: "canva",
    });

    if (!stored.ok) {
      const status = isBlobConfigStoreError(stored) ? 500 : 400;
      return NextResponse.json({ error: stored.error }, { status });
    }

    return NextResponse.json({ data: { imageUrl: stored.imageUrl } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
