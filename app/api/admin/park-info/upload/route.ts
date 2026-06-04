import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getAdminUserFromCookieToken, ADMIN_SESSION_COOKIE } from "@/lib/auth/adminSession";
import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB for field layout images
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/svg+xml": "svg",
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = toAdminRole(user.role, user.isMaster);
  if (!canAccessAdminModule(role, "PARK_INFO"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image file required" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Images only" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });

  const ext = MIME_EXT[file.type] ?? file.name.split(".").pop() ?? "bin";
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${safeExt}`;
  const arrayBuffer = await file.arrayBuffer();

  if (process.env.NODE_ENV === "production") {
    const blob = await put(`park-info/${uniqueName}`, Buffer.from(arrayBuffer), {
      access: "public", addRandomSuffix: false, contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "park-info");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, uniqueName), Buffer.from(arrayBuffer));
  return NextResponse.json({ url: `/uploads/park-info/${uniqueName}` });
}
