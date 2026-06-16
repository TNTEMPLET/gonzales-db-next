import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { ingestBracketBuffer, mergeIngestionIntoGames } from "@/lib/tournament-brackets/ingestion";
import { storeBracketArtifact } from "@/lib/tournament-brackets/ingestion/storeBracketArtifact";
import type { IngestionProfile } from "@/lib/tournament-brackets/ingestion/types";
import { sniffMimeFromBuffer } from "@/lib/tournament-brackets/ingestion/mime";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type IngestBodyJson = {
  projectId?: string;
  base64?: string;
  mimeType?: string;
  filename?: string;
  profile?: IngestionProfile;
  mergeMode?: "replace" | "append";
};

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    let projectId: string;
    let buffer: ArrayBuffer;
    let mimeType: string;
    let filename: string | undefined;
    let mergeMode: "replace" | "append" = "replace";
    let profile: IngestionProfile = "auto";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      projectId = String(form.get("projectId") ?? "");
      const file = form.get("file");
      if (!projectId || file == null) {
        return NextResponse.json({ error: "projectId and file are required" }, { status: 400 });
      }
      if (typeof file === "string") {
        return NextResponse.json({ error: "Invalid file field (expected binary upload)" }, { status: 400 });
      }
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "Invalid file upload" }, { status: 400 });
      }
      buffer = await file.arrayBuffer();
      mimeType = file instanceof File ? file.type : "";
      filename = file instanceof File ? file.name || undefined : undefined;
      const mm = form.get("mergeMode");
      if (mm === "append" || mm === "replace") mergeMode = mm;
      const p = form.get("profile");
      if (p === "xlsx_tournament_schedule") profile = p;
      else if (p === "pdf_ocr" || p === "pdf_vision") profile = p;
    } else {
      let body: IngestBodyJson;
      try {
        body = (await request.json()) as IngestBodyJson;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.projectId || typeof body.base64 !== "string" || !body.mimeType) {
        return NextResponse.json(
          { error: "projectId, base64, and mimeType are required (or use multipart/form-data with file)" },
          { status: 400 },
        );
      }
      projectId = body.projectId;
      const nodeBuf = Buffer.from(body.base64, "base64");
      buffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
      mimeType = body.mimeType;
      filename = typeof body.filename === "string" ? body.filename : undefined;
      mergeMode = body.mergeMode === "append" ? "append" : "replace";
      profile = body.profile === "xlsx_tournament_schedule" ? body.profile : body.profile === "pdf_ocr" || body.profile === "pdf_vision" ? body.profile : "auto";
    }

    const project = await prisma.bracketProject.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const sniffedMime = sniffMimeFromBuffer(buffer);
    const isPdf =
      mimeType.toLowerCase() === "application/pdf" || sniffedMime === "application/pdf";

    let artifactUrl: string | undefined;
    if (isPdf) {
      const stored = await storeBracketArtifact(
        Buffer.from(buffer),
        filename ?? "bracket.pdf",
        "application/pdf",
      );
      artifactUrl = stored.url;
      const urls = Array.isArray(project.sourceArtifactUrls)
        ? (project.sourceArtifactUrls as string[])
        : [];
      urls.push(stored.url);
      await prisma.bracketProject.update({
        where: { id: projectId },
        data: { sourceArtifactUrls: urls },
      });
    }

    const ingested = await ingestBracketBuffer({
      buffer,
      mimeType: isPdf ? "application/pdf" : mimeType,
      filename,
      seasonYear: project.seasonYear,
      profile,
    });

    if (artifactUrl && ingested.specPatch?.pdfIngestHints && typeof ingested.specPatch.pdfIngestHints === "object") {
      ingested.specPatch.pdfIngestHints = {
        ...(ingested.specPatch.pdfIngestHints as object),
        artifactUrl,
      };
    }

    const spec = parseBracketSpec(project.spec);
    const games =
      ingested.games.length > 0
        ? mergeIngestionIntoGames(spec.games, ingested.games, mergeMode)
        : spec.games;
    // Replace (do not append) so re-uploading the same PDF does not duplicate warnings.
    const ingestionWarnings = ingested.warnings;

    const partial: Record<string, unknown> = { games, ingestionWarnings };
    if (ingested.specPatch && Object.keys(ingested.specPatch).length > 0) {
      Object.assign(partial, ingested.specPatch);
    }

    const next = mergeBracketSpec(spec, partial);

    await prisma.bracketProject.update({
      where: { id: projectId },
      data: { spec: JSON.parse(JSON.stringify(next)) },
    });

    return NextResponse.json({
      data: {
        gamesImported: ingested.games.length,
        warnings: ingested.warnings,
        totalGames: next.games.length,
        pdfTemplateDetected: ingested.pdfTemplate?.templateId ?? null,
        wizardPrefilled: Boolean(ingested.specPatch),
        roundsBuilt: ingested.roundsBuilt ?? 0,
        artifactUrl: artifactUrl ?? null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: message,
        hint: "If this persists, check server logs and file size limits.",
      },
      { status: 500 },
    );
  }
}
