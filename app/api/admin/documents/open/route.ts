import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import {
  fileIsUnderOrgFolder,
  getWebViewLinkForFile,
} from "@/lib/google/driveOrgFolder";
import { isDriveServiceAccountConfigured } from "@/lib/google/driveServiceAccount";
import { ensureAdminModule } from "@/lib/news/auth";
import {
  adminEmailAllowedForOrgDrive,
  getAdminGoogleWorkspaceDomain,
  getOrgDocumentsConfig,
} from "@/lib/orgDocuments";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function htmlPage(title: string, body: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a}` +
      `a{color:#1864D7}</style></head><body><h1>${title}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ORG_DOCUMENTS");
  if (!auth.ok) {
    if (auth.status === 401) {
      return htmlPage(
        "Sign in required",
        `<p>You must be signed in to the admin site to open organization documents.</p>` +
          `<p><a href="/admin/login?next=${encodeURIComponent("/admin/documents")}">Admin sign in</a></p>`,
        401,
      );
    }
    return htmlPage("Access denied", `<p>You do not have access to organization documents.</p>`, 403);
  }

  if (!isDriveServiceAccountConfigured()) {
    return htmlPage(
      "Drive not configured",
      `<p>Google Drive API is not configured on this server.</p>`,
      503,
    );
  }

  const drive = getOrgDocumentsConfig();
  if (!drive) {
    return htmlPage(
      "Folder not configured",
      `<p>AP_GOOGLE_DRIVE_FOLDER_URL is not set.</p>`,
      503,
    );
  }

  const fileId = request.nextUrl.searchParams.get("fileId")?.trim() ?? "";
  if (!fileId) {
    return htmlPage("Missing file", `<p>No file was specified.</p>`, 400);
  }

  const sessionUser = await getAdminUserFromRequest(request);
  if (!sessionUser) {
    return htmlPage(
      "Sign in required",
      `<p><a href="/admin/login?next=${encodeURIComponent("/admin/documents")}">Admin sign in</a></p>`,
      401,
    );
  }

  const adminRow = await prisma.adminUser.findUnique({
    where: { id: sessionUser.id },
    select: { email: true, googleSub: true },
  });

  if (!adminRow?.googleSub) {
    const domain = getAdminGoogleWorkspaceDomain();
    return htmlPage(
      "Google sign-in required",
      `<p>Opening files in Google Drive requires that you have signed in to the admin site with your <strong>@${domain}</strong> Google account at least once (so we can match your workspace identity).</p>` +
        `<p>If you normally use a password, sign out and use <strong>Sign in with Google</strong> on the admin login page, then try again.</p>` +
        `<p><a href="/admin/login?next=${encodeURIComponent("/admin/documents")}">Admin sign in</a></p>`,
      403,
    );
  }

  if (!adminEmailAllowedForOrgDrive(adminRow.email)) {
    const domainLabel = getAdminGoogleWorkspaceDomain();
    return htmlPage(
      "Wrong email domain",
      `<p>Only <strong>@${domainLabel}</strong> workspace accounts may open these Drive links.</p>`,
      403,
    );
  }

  const under = await fileIsUnderOrgFolder(fileId, drive.folderId);
  if (!under.ok) {
    return htmlPage("Could not verify file", `<p>${under.message}</p>`, under.status);
  }
  if (!under.data) {
    return htmlPage(
      "Not in this folder",
      `<p>This file is not part of the configured organization folder.</p>`,
      403,
    );
  }

  const link = await getWebViewLinkForFile(fileId);
  if (!link.ok) {
    return htmlPage("Could not open", `<p>${link.message}</p>`, link.status);
  }

  return NextResponse.redirect(link.data, 302);
}
