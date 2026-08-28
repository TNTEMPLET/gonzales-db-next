import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";

const MAX_COACH_DOCUMENT_BYTES = 10 * 1024 * 1024;

const COACH_DOCUMENT_MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type StoreCoachDocumentResult =
  | { ok: true; url: string; mimeType: string; fileName: string }
  | { ok: false; error: string; blobConfigError?: boolean };

function normalizeMimeType(value: string) {
  return (value.trim().split(";")[0] || "").toLowerCase();
}

function safeExtension(contentType: string, fileName?: string): string | null {
  const fromMime = COACH_DOCUMENT_MIME_EXTENSION_MAP[contentType];
  if (fromMime) return fromMime;

  if (!fileName?.includes(".")) return null;
  const ext = fileName.split(".").pop();
  const cleaned = ext?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  return cleaned === "jpeg" ? "jpg" : cleaned || null;
}

function mimeTypeForExtension(extension: string): string | null {
  return (
    Object.entries(COACH_DOCUMENT_MIME_EXTENSION_MAP).find(([, ext]) => ext === extension)?.[0] ||
    null
  );
}

function cleanOriginalFileName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "abuse-awareness-training-certificate";
  return trimmed.replace(/[^\w.\- ]+/g, "").slice(0, 140) || "abuse-awareness-training-certificate";
}

export async function storeCoachDocumentFromFile(
  file: File,
  options: { coachUserId: string; target: "abuse-awareness-training" },
): Promise<StoreCoachDocumentResult> {
  if (file.size > MAX_COACH_DOCUMENT_BYTES) {
    return { ok: false, error: "Certificate must be 10MB or smaller" };
  }

  const contentType = normalizeMimeType(file.type);
  const extension = safeExtension(contentType, file.name);
  if (!extension || !Object.values(COACH_DOCUMENT_MIME_EXTENSION_MAP).includes(extension)) {
    return { ok: false, error: "Upload a PDF, JPG, PNG, or WebP certificate" };
  }

  const resolvedMimeType =
    COACH_DOCUMENT_MIME_EXTENSION_MAP[contentType] ? contentType : mimeTypeForExtension(extension);
  if (!resolvedMimeType) {
    return { ok: false, error: "Unsupported certificate file type" };
  }

  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = cleanOriginalFileName(file.name);

  try {
    if (process.env.NODE_ENV === "production") {
      const blob = await put(
        `coach-documents/${options.target}/${options.coachUserId}/${uniqueName}`,
        buffer,
        {
          access: "public",
          addRandomSuffix: false,
          contentType: resolvedMimeType,
        },
      );
      return { ok: true, url: blob.url, mimeType: resolvedMimeType, fileName };
    }

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "coach-documents",
      options.target,
      options.coachUserId,
    );
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, uniqueName), buffer);

    return {
      ok: true,
      url: `/uploads/coach-documents/${options.target}/${options.coachUserId}/${uniqueName}`,
      mimeType: resolvedMimeType,
      fileName,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const blobConfigError =
      message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("Vercel Blob");
    return {
      ok: false,
      error: blobConfigError
        ? "Certificate uploads require Vercel Blob in production. Connect Blob storage and set BLOB_READ_WRITE_TOKEN."
        : `Failed to store certificate: ${message}`,
      blobConfigError,
    };
  }
}
