import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";

/** Max size for admin image uploads (news, social, ingest). */
export const ADMIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const ADMIN_IMAGE_MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export type AdminImageStorageTarget = "news" | "social" | "canva";

const TARGET_PATH: Record<
  AdminImageStorageTarget,
  { blobPrefix: string; publicSubdir: string }
> = {
  news: { blobPrefix: "news", publicSubdir: "news" },
  social: { blobPrefix: "social", publicSubdir: "social" },
  canva: { blobPrefix: "canva-ingest", publicSubdir: "canva-ingest" },
};

function safeExtension(contentType: string, fileName?: string): string | null {
  const base = (contentType.trim().split(";")[0] || "").toLowerCase();
  const fromMime = ADMIN_IMAGE_MIME_EXTENSION_MAP[base];
  if (fromMime) return fromMime;
  if (fileName?.includes(".")) {
    const ext = fileName.split(".").pop();
    if (ext) return ext.toLowerCase().replace(/[^a-z0-9]/g, "") || null;
  }
  return null;
}

/** For remote ingest: require a known image MIME from the response. */
export function validateStrictImageContentType(contentType: string): boolean {
  const base = (contentType.trim().split(";")[0] || "").toLowerCase();
  return Boolean(ADMIN_IMAGE_MIME_EXTENSION_MAP[base]);
}

export type StoreImageResult =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string; blobConfigError?: boolean };

/**
 * Persist image bytes to Vercel Blob (production) or public/uploads/{subdir} (dev).
 */
export async function storeAdminImageBuffer(options: {
  buffer: Buffer;
  contentType: string;
  target: AdminImageStorageTarget;
  /** Original filename hint for extension fallback (optional). */
  fileName?: string;
}): Promise<StoreImageResult> {
  const { buffer, target, fileName } = options;
  const ctBase = (options.contentType.trim().split(";")[0] || "").toLowerCase();

  if (buffer.length > ADMIN_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Image must be 5MB or smaller" };
  }

  if (!ctBase.startsWith("image/")) {
    return { ok: false, error: "Only image files are allowed" };
  }

  const extRaw = safeExtension(ctBase, fileName);
  if (!extRaw) {
    return { ok: false, error: "Unsupported image type" };
  }

  const safeExt = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExt) {
    return { ok: false, error: "Unsupported image extension" };
  }

  const { blobPrefix, publicSubdir } = TARGET_PATH[target];
  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${safeExt}`;

  try {
    if (process.env.NODE_ENV === "production") {
      const blob = await put(`${blobPrefix}/${uniqueName}`, buffer, {
        access: "public",
        addRandomSuffix: false,
        contentType: ctBase,
      });
      return { ok: true, imageUrl: blob.url };
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", publicSubdir);
    await mkdir(uploadDir, { recursive: true });
    const destination = path.join(uploadDir, uniqueName);
    await writeFile(destination, buffer);

    return { ok: true, imageUrl: `/uploads/${publicSubdir}/${uniqueName}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const blobConfigError =
      message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("Vercel Blob");
    return {
      ok: false,
      error: blobConfigError
        ? "Image uploads require Vercel Blob in production. Connect Blob storage and set BLOB_READ_WRITE_TOKEN."
        : `Failed to store image: ${message}`,
      blobConfigError,
    };
  }
}

/**
 * Validate a browser File and store it.
 */
export async function storeAdminImageFromFile(
  file: File,
  target: AdminImageStorageTarget,
): Promise<StoreImageResult> {
  const fileType = file.type.toLowerCase();
  if (!fileType.startsWith("image/")) {
    return { ok: false, error: "Only image files are allowed" };
  }

  if (file.size > ADMIN_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Image must be 5MB or smaller" };
  }

  const extension =
    ADMIN_IMAGE_MIME_EXTENSION_MAP[fileType] ||
    (file.name.includes(".") ? file.name.split(".").pop() : null);
  if (!extension) {
    return { ok: false, error: "Unsupported image type" };
  }

  const arrayBuffer = await file.arrayBuffer();
  return storeAdminImageBuffer({
    buffer: Buffer.from(arrayBuffer),
    contentType: fileType,
    target,
    fileName: file.name,
  });
}

export function isBlobConfigStoreError(result: StoreImageResult): boolean {
  return !result.ok && Boolean(result.blobConfigError);
}
