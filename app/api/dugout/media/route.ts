import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { ensureCoach } from "@/lib/dugout/auth";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: NextRequest) {
  const auth = await ensureCoach(request);
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
        { error: "Media file is required" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image and GIF files are allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Media file must be 8MB or smaller" },
        { status: 400 },
      );
    }

    const extension = MIME_EXTENSION_MAP[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Unsupported media type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 },
      );
    }

    const mediaType = file.type === "image/gif" ? "GIF" : "IMAGE";
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
    const arrayBuffer = await file.arrayBuffer();

    let mediaUrl: string;

    if (process.env.NODE_ENV === "production") {
      const blob = await put(`dugout/${uniqueName}`, Buffer.from(arrayBuffer), {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type,
      });
      mediaUrl = blob.url;
    } else {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "dugout");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(
        path.join(uploadDir, uniqueName),
        Buffer.from(arrayBuffer),
      );
      mediaUrl = `/uploads/dugout/${uniqueName}`;
    }

    return NextResponse.json({
      data: {
        mediaUrl,
        mediaType,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (
      message.includes("BLOB_READ_WRITE_TOKEN") ||
      message.includes("Vercel Blob")
    ) {
      return NextResponse.json(
        {
          error:
            "Media uploads require Vercel Blob in production. Set BLOB_READ_WRITE_TOKEN.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: `Failed to upload media: ${message}` },
      { status: 500 },
    );
  }
}
