import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { ensureNewsAdmin } from "@/lib/news/auth";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const admin = await ensureNewsAdmin(request);
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message || "Unauthorized" },
      { status: admin.status },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image must be 5MB or smaller" },
        { status: 400 },
      );
    }

    const extension =
      MIME_EXTENSION_MAP[file.type] ||
      (file.name.includes(".") ? file.name.split(".").pop() : null);

    if (!extension) {
      return NextResponse.json(
        { error: "Unsupported image type" },
        { status: 400 },
      );
    }

    const safeExt = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!safeExt) {
      return NextResponse.json(
        { error: "Unsupported image extension" },
        { status: 400 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "news");
    await mkdir(uploadDir, { recursive: true });

    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${safeExt}`;
    const destination = path.join(uploadDir, uniqueName);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(destination, Buffer.from(arrayBuffer));

    return NextResponse.json({
      data: {
        imageUrl: `/uploads/news/${uniqueName}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to upload image: ${message}` },
      { status: 500 },
    );
  }
}
