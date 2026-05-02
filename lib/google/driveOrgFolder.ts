import { driveV3Request, type DriveApiResult } from "@/lib/google/driveServiceAccount";

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
