import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function resolveUploadMimeType(file: File): string | null {
  if (file.type && ALLOWED.has(file.type)) return file.type;
  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = typeof formData.get("projectId") === "string" ? String(formData.get("projectId")) : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const mimeType = resolveUploadMimeType(file);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported MIME type: ${file.type || "(unknown)"}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 12MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const uniqueName = `tournament-brackets/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  let url: string;
  if (process.env.NODE_ENV === "production") {
    const blob = await put(uniqueName, buf, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
    });
    url = blob.url;
  } else {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "tournament-brackets");
    await mkdir(uploadDir, { recursive: true });
    const localName = path.basename(uniqueName);
    await writeFile(path.join(uploadDir, localName), buf);
    url = `/uploads/tournament-brackets/${localName}`;
  }

  if (projectId) {
    const row = await prisma.bracketProject.findUnique({ where: { id: projectId } });
    if (row) {
      const urls = Array.isArray(row.sourceArtifactUrls)
        ? (row.sourceArtifactUrls as string[])
        : [];
      urls.push(url);
      await prisma.bracketProject.update({
        where: { id: projectId },
        data: { sourceArtifactUrls: urls },
      });
    }
  }

  return NextResponse.json({ data: { url, mimeType, size: file.size } });
}
