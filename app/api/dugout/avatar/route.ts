import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB

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
        { error: "Image must be 3MB or smaller" },
        { status: 400 },
      );
    }

    const extension = MIME_EXTENSION_MAP[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 },
      );
    }

    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
    const arrayBuffer = await file.arrayBuffer();

    let avatarUrl: string;

    if (process.env.NODE_ENV === "production") {
      const blob = await put(
        `avatars/${uniqueName}`,
        Buffer.from(arrayBuffer),
        {
          access: "public",
          addRandomSuffix: false,
          contentType: file.type,
        },
      );
      avatarUrl = blob.url;
    } else {
      const uploadDir = path.join(
        process.cwd(),
        "public",
        "uploads",
        "avatars",
      );
      await mkdir(uploadDir, { recursive: true });
      await writeFile(
        path.join(uploadDir, uniqueName),
        Buffer.from(arrayBuffer),
      );
      avatarUrl = `/uploads/avatars/${uniqueName}`;
    }

    // Persist to the correct user table
    const admin = await getAdminUserFromRequest(request);
    if (admin) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "AdminUser" SET "avatarUrl" = ${avatarUrl}, "updatedAt" = NOW() WHERE "id" = ${admin.id}`,
      );
    } else {
      const coach = await getCoachUserFromRequest(request);
      if (coach) {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "RegisteredUser" SET "avatarUrl" = ${avatarUrl}, "updatedAt" = NOW() WHERE "id" = ${coach.id}`,
        );
      }
    }

    return NextResponse.json({ data: { avatarUrl } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (
      message.includes("BLOB_READ_WRITE_TOKEN") ||
      message.includes("Vercel Blob")
    ) {
      return NextResponse.json(
        {
          error:
            "Image uploads require Vercel Blob in production. Set BLOB_READ_WRITE_TOKEN.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: `Failed to upload avatar: ${message}` },
      { status: 500 },
    );
  }
}
