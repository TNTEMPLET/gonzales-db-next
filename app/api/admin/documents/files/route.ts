import { NextRequest, NextResponse } from "next/server";

import { listFolderChildren } from "@/lib/google/driveOrgFolder";
import { isDriveServiceAccountConfigured } from "@/lib/google/driveServiceAccount";
import { ensureAdminModule } from "@/lib/news/auth";
import { getOrgDocumentsConfig } from "@/lib/orgDocuments";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ORG_DOCUMENTS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  if (!isDriveServiceAccountConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Drive API is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON on the server.",
      },
      { status: 503 },
    );
  }

  const drive = getOrgDocumentsConfig();
  if (!drive) {
    return NextResponse.json(
      { error: "AP_GOOGLE_DRIVE_FOLDER_URL is not set." },
      { status: 503 },
    );
  }

  const folderId =
    request.nextUrl.searchParams.get("folderId")?.trim() || drive.folderId;

  const result = await listFolderChildren(folderId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ data: result.data });
}
