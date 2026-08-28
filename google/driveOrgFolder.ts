import {
  driveV3Request,
  getDriveAccessToken,
  getDriveAccessTokenForUpload,
  type DriveApiResult,
} from "@/lib/google/driveServiceAccount";

const SUPPORTS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

export type DriveFileRow = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

export type DrivePermissionRow = {
  id: string;
  type: string;
  role?: string;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
};

type FilesListResponse = {
  files?: DriveFileRow[];
  nextPageToken?: string;
};

type PermissionsListResponse = {
  permissions?: DrivePermissionRow[];
};

export async function listFolderChildren(
  folderId: string,
): Promise<DriveApiResult<DriveFileRow[]>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    "files(id,name,mimeType,modifiedTime,size),nextPageToken",
  );
  const path = `/files?q=${q}&fields=${fields}&pageSize=100&orderBy=folder,name&${SUPPORTS}`;
  const res = await driveV3Request<FilesListResponse>(path, { method: "GET" });
  if (!res.ok) return res;
  return { ok: true, data: res.data.files ?? [] };
}

export async function listFolderPermissions(
  folderId: string,
): Promise<DriveApiResult<DrivePermissionRow[]>> {
  const fields = encodeURIComponent(
    "permissions(id,type,emailAddress,role,domain,displayName)",
  );
  const path = `/files/${encodeURIComponent(folderId)}/permissions?fields=${fields}&${SUPPORTS}`;
  const res = await driveV3Request<PermissionsListResponse>(path, { method: "GET" });
  if (!res.ok) return res;
  return { ok: true, data: res.data.permissions ?? [] };
}

const SHARE_ROLES = new Set(["reader", "commenter", "writer", "fileOrganizer", "organizer"]);

export async function addUserPermission(
  folderId: string,
  email: string,
  role: string,
  sendNotificationEmail = true,
): Promise<DriveApiResult<{ id?: string }>> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, status: 400, message: "Invalid email address." };
  }
  if (!SHARE_ROLES.has(role)) {
    return { ok: false, status: 400, message: "Invalid sharing role." };
  }

  const query = new URLSearchParams({
    supportsAllDrives: "true",
    sendNotificationEmail: sendNotificationEmail ? "true" : "false",
  });
  const path = `/files/${encodeURIComponent(folderId)}/permissions?${query.toString()}`;
  return driveV3Request<{ id?: string }>(path, {
    method: "POST",
    body: JSON.stringify({
      type: "user",
      role,
      emailAddress: trimmed,
    }),
  });
}

export async function removePermission(
  folderId: string,
  permissionId: string,
): Promise<DriveApiResult<void>> {
  if (!permissionId.trim()) {
    return { ok: false, status: 400, message: "permissionId is required." };
  }
  const path = `/files/${encodeURIComponent(folderId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`;
  return driveV3Request<void>(path, { method: "DELETE" });
}

type FileParentsOnly = { parents?: string[] };

async function fetchFileParentsOnly(
  fileId: string,
): Promise<DriveApiResult<FileParentsOnly>> {
  const fields = encodeURIComponent("parents");
  const path = `/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`;
  return driveV3Request<FileParentsOnly>(path, { method: "GET" });
}

/**
 * True if `fileId` is the org folder itself or has `orgFolderId` in its parent chain.
 */
export async function fileIsUnderOrgFolder(
  fileId: string,
  orgFolderId: string,
): Promise<DriveApiResult<boolean>> {
  const fid = fileId.trim();
  const root = orgFolderId.trim();
  if (!fid || !root) {
    return { ok: false, status: 400, message: "Invalid file or folder id." };
  }
  if (fid === root) {
    return { ok: true, data: true };
  }

  const visited = new Set<string>();
  let current: string | null = fid;

  while (current && visited.size < 100) {
    if (visited.has(current)) {
      return { ok: false, status: 400, message: "Invalid folder structure." };
    }
    visited.add(current);

    const meta = await fetchFileParentsOnly(current);
    if (!meta.ok) return meta;

    const parents = meta.data.parents ?? [];
    if (parents.includes(root)) {
      return { ok: true, data: true };
    }
    if (parents.length === 0) {
      return { ok: true, data: false };
    }
    current = parents[0] ?? null;
  }

  return { ok: true, data: false };
}

type WebViewOnly = { webViewLink?: string };

export async function getWebViewLinkForFile(
  fileId: string,
): Promise<DriveApiResult<string>> {
  const trimmed = fileId.trim();
  if (!trimmed) {
    return { ok: false, status: 400, message: "fileId is required." };
  }
  const fields = encodeURIComponent("webViewLink");
  const path = `/files/${encodeURIComponent(trimmed)}?fields=${fields}&supportsAllDrives=true`;
  const res = await driveV3Request<WebViewOnly>(path, { method: "GET" });
  if (!res.ok) return res;
  const url = res.data.webViewLink?.trim();
  if (!url) {
    return { ok: false, status: 404, message: "No Google Drive link for this item." };
  }
  return { ok: true, data: url };
}

type UploadedDriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
  modifiedTime?: string;
};

function escapeDriveQueryString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function findFileInFolderByName(
  folderId: string,
  fileName: string,
): Promise<DriveApiResult<DriveFileRow | null>> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed = false and name = '${escapeDriveQueryString(fileName)}'`,
  );
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const path = `/files?q=${q}&fields=${fields}&pageSize=1&${SUPPORTS}`;
  const res = await driveV3Request<FilesListResponse>(path, { method: "GET" });
  if (!res.ok) return res;
  return { ok: true, data: res.data.files?.[0] ?? null };
}

export async function findChildFolderByName(
  parentFolderId: string,
  folderName: string,
): Promise<DriveApiResult<DriveFileRow | null>> {
  const q = encodeURIComponent(
    `'${parentFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryString(folderName)}'`,
  );
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const path = `/files?q=${q}&fields=${fields}&pageSize=1&${SUPPORTS}`;
  const res = await driveV3Request<FilesListResponse>(path, { method: "GET" });
  if (!res.ok) return res;
  return { ok: true, data: res.data.files?.[0] ?? null };
}

/**
 * Resolve a nested folder path under the org Drive root, e.g. ["2026", "2026 All Star Roster Docs"].
 */
export async function resolveOrgDriveFolderPath(
  rootFolderId: string,
  folderNames: string[],
): Promise<DriveApiResult<string>> {
  let currentId = rootFolderId.trim();
  if (!currentId) {
    return { ok: false, status: 400, message: "rootFolderId is required." };
  }

  for (const folderName of folderNames) {
    const child = await findChildFolderByName(currentId, folderName);
    if (!child.ok) return child;
    if (!child.data?.id) {
      return {
        ok: false,
        status: 404,
        message: `Drive folder not found: ${folderName}`,
      };
    }
    currentId = child.data.id;
  }

  return { ok: true, data: currentId };
}

/**
 * Upload a file into an org Drive folder. Replaces an existing file with the same name in that folder.
 */
export async function uploadFileToDriveFolder(options: {
  folderId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}): Promise<DriveApiResult<UploadedDriveFile>> {
  const folderId = options.folderId.trim();
  const fileName = options.fileName.trim();
  if (!folderId || !fileName) {
    return { ok: false, status: 400, message: "folderId and fileName are required." };
  }
  if (options.content.length === 0) {
    return { ok: false, status: 400, message: "File content is empty." };
  }

  const token = await getDriveAccessTokenForUpload();
  if (!token) {
    return {
      ok: false,
      status: 503,
      message:
        "Google Drive service account is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (or _BASE64).",
    };
  }

  const fields = encodeURIComponent("id,name,webViewLink,modifiedTime");
  const existing = await findFileInFolderByName(folderId, fileName);
  if (!existing.ok) return existing;

  if (existing.data?.id) {
    const updated = await updateDriveFileContent(
      token,
      existing.data.id,
      options.mimeType,
      options.content,
      fields,
    );
    if (updated.ok) return updated;
    if (updated.status !== 403) return updated;
    await trashDriveFile(token, existing.data.id);
  }

  const { body, contentType } = buildMultipartUploadBody(
    { name: fileName, parents: [folderId] },
    options.mimeType,
    options.content,
  );
  const createUrl =
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${fields}`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });
  if (!createRes.ok) {
    let message = createRes.statusText;
    try {
      const j = (await createRes.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: createRes.status, message };
  }
  const data = (await createRes.json()) as UploadedDriveFile;
  return { ok: true, data };
}

function buildMultipartUploadBody(
  metadata: Record<string, unknown>,
  mimeType: string,
  content: Buffer,
) {
  const boundary = `drive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const delimiter = `--${boundary}\r\n`;
  const close = `\r\n--${boundary}--`;
  const metaPart = Buffer.from(
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
    "utf8",
  );
  const filePart = Buffer.from(
    `\r\n${delimiter}Content-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const body = Buffer.concat([metaPart, filePart, content, Buffer.from(close, "utf8")]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function trashDriveFile(token: string, fileId: string) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trashed: true }),
  });
}

async function updateDriveFileContent(
  token: string,
  fileId: string,
  mimeType: string,
  content: Buffer,
  fields: string,
): Promise<DriveApiResult<UploadedDriveFile>> {
  const updateUrl =
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?uploadType=media&supportsAllDrives=true&fields=${fields}`;
  const res = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(content),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, message };
  }
  const data = (await res.json()) as UploadedDriveFile;
  return { ok: true, data };
}
