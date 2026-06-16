import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";

const MAX_BYTES = 12 * 1024 * 1024;

export type StoredBracketArtifact = {
  url: string;
  mimeType: string;
  size: number;
};

export async function storeBracketArtifact(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<StoredBracketArtifact> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("File too large (max 12MB)");
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.bin";
  const uniqueName = `tournament-brackets/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;

  if (process.env.NODE_ENV === "production") {
    const blob = await put(uniqueName, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
    });
    return { url: blob.url, mimeType, size: buffer.byteLength };
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "tournament-brackets");
  await mkdir(uploadDir, { recursive: true });
  const localName = path.basename(uniqueName);
  await writeFile(path.join(uploadDir, localName), buffer);
  return {
    url: `/uploads/tournament-brackets/${localName}`,
    mimeType,
    size: buffer.byteLength,
  };
}
