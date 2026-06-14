/**
 * Upload All-Star roster contact CSV exports to the shared AP Google Drive folder.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-all-star-roster-contacts-to-drive.ts
 *   npx tsx --env-file=.env.local scripts/upload-all-star-roster-contacts-to-drive.ts --file exports/all-star-roster-contacts-all-orgs-2026.csv
 *   npx tsx --env-file=.env.local scripts/upload-all-star-roster-contacts-to-drive.ts --folder-id <driveFolderId>
 *
 * Optional env for uploads into a user-owned shared folder (domain-wide delegation):
 *   GOOGLE_DRIVE_DELEGATED_USER_EMAIL=trent@apbaseball.com
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  resolveOrgDriveFolderPath,
  uploadFileToDriveFolder,
} from "@/lib/google/driveOrgFolder";
import { getDriveDelegatedUserEmail } from "@/lib/google/driveServiceAccount";
import { getOrgDocumentsConfig } from "@/lib/orgDocuments";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1]?.trim() || undefined;
}

async function main() {
  const fileArg = readArg("--file");
  const folderIdArg = readArg("--folder-id");
  const filePath = resolve(
    fileArg || "exports/all-star-roster-contacts-all-orgs-2026.csv",
  );
  const content = readFileSync(filePath);
  const fileName = filePath.split("/").pop() || "all-star-roster-contacts.csv";

  const driveConfig = getOrgDocumentsConfig();
  if (!driveConfig) {
    throw new Error("AP_GOOGLE_DRIVE_FOLDER_URL is not configured.");
  }

  let targetFolderId = folderIdArg;
  if (!targetFolderId) {
    const resolved = await resolveOrgDriveFolderPath(driveConfig.folderId, [
      "2026",
      "2026 All Star Roster Docs",
    ]);
    if (!resolved.ok) {
      throw new Error(
        `Could not resolve Drive folder path (2026 / 2026 All Star Roster Docs): ${resolved.message}`,
      );
    }
    targetFolderId = resolved.data;
  }

  const result = await uploadFileToDriveFolder({
    folderId: targetFolderId,
    fileName,
    mimeType: "text/csv",
    content,
  });

  if (!result.ok) {
    const delegated = getDriveDelegatedUserEmail();
    throw new Error(
      `Drive upload failed (${result.status}): ${result.message}.` +
        ` Uploads impersonate ${delegated} via domain-wide delegation.` +
        " Ask your Google Workspace admin to authorize the Drive service account client ID" +
        " with scope https://www.googleapis.com/auth/drive, or manually upload the CSV to" +
        " AP Baseball > 2026 > 2026 All Star Roster Docs.",
    );
  }

  console.log(`Uploaded ${fileName} to Google Drive.`);
  console.log(`Folder ID: ${targetFolderId}`);
  console.log(`Root folder: ${driveConfig.folderUrl}`);
  if (result.data.webViewLink) {
    console.log(`File: ${result.data.webViewLink}`);
  } else {
    console.log(`File ID: ${result.data.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
