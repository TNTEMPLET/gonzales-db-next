import { NextRequest, NextResponse } from "next/server";

import {
  addUserPermission,
  listFolderPermissions,
  removePermission,
} from "@/lib/google/driveOrgFolder";
import { isDriveServiceAccountConfigured } from "@/lib/google/driveServiceAccount";
import { ensureAdminModule, ensureAdminRole } from "@/lib/news/auth";
import { getOrgDocumentsConfig } from "@/lib/orgDocuments";

export const runtime = "nodejs";

async function requireFolder() {
  const drive = getOrgDocumentsConfig();
  if (!drive) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "AP_GOOGLE_DRIVE_FOLDER_URL is not set." },
        { status: 503 },
      ),
    };
  }
  if (!isDriveServiceAccountConfigured()) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Google Drive API is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON on the server.",
        },
        { status: 503 },
      ),
    };
  }
  return { ok: true as const, folderId: drive.folderId };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ORG_DOCUMENTS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const folder = await requireFolder();
  if (!folder.ok) return folder.response;

  const folderId =
    request.nextUrl.searchParams.get("folderId")?.trim() || folder.folderId;

  const result = await listFolderPermissions(folderId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ data: result.data });
}

export async function POST(request: NextRequest) {
  const mod = await ensureAdminModule(request, "ORG_DOCUMENTS");
  if (!mod.ok) {
    return NextResponse.json(
      { error: mod.message || "Unauthorized" },
      { status: mod.status },
    );
  }

  const adminOnly = await ensureAdminRole(request, "ADMIN");
  if (!adminOnly.ok) {
    return NextResponse.json(
      {
        error:
          "Only admins can change folder sharing. Ask a master or site admin to grant access.",
      },
      { status: adminOnly.status },
    );
  }

  const folder = await requireFolder();
  if (!folder.ok) return folder.response;

  let body: { email?: string; role?: string; sendNotificationEmail?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const role = typeof body.role === "string" ? body.role : "reader";
  const sendNotificationEmail = body.sendNotificationEmail !== false;

  const result = await addUserPermission(
    folder.folderId,
    email,
    role,
    sendNotificationEmail,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: NextRequest) {
  const mod = await ensureAdminModule(request, "ORG_DOCUMENTS");
  if (!mod.ok) {
    return NextResponse.json(
      { error: mod.message || "Unauthorized" },
      { status: mod.status },
    );
  }

  const adminOnly = await ensureAdminRole(request, "ADMIN");
  if (!adminOnly.ok) {
    return NextResponse.json(
      {
        error:
          "Only admins can remove folder sharing. Ask a master or site admin.",
      },
      { status: adminOnly.status },
    );
  }

  const folder = await requireFolder();
  if (!folder.ok) return folder.response;

  const permissionId = request.nextUrl.searchParams.get("permissionId")?.trim();
  if (!permissionId) {
    return NextResponse.json({ error: "permissionId query required" }, { status: 400 });
  }

  const result = await removePermission(folder.folderId, permissionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
