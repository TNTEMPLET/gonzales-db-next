/**
 * AP Baseball shared Google Drive folder — configured via AP_GOOGLE_DRIVE_FOLDER_URL.
 * Accepts a full https://drive.google.com/... URL or a bare folder ID.
 */

const DRIVE_HOST = "drive.google.com";

/** Google Drive folder / file IDs (alphanumeric, underscore, hyphen). */
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function extractFolderIdFromUrl(url: URL): string | null {
  const foldersMatch = url.pathname.match(/\/drive\/folders\/([^/]+)/);
  if (foldersMatch?.[1] && ID_PATTERN.test(foldersMatch[1])) {
    return foldersMatch[1];
  }
  const idParam = url.searchParams.get("id");
  if (idParam && ID_PATTERN.test(idParam)) {
    return idParam;
  }
  return null;
}

function extractFolderId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (!t.includes("/") && !t.includes("?")) {
    if (ID_PATTERN.test(t) && t.length >= 10) return t;
    return null;
  }

  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== DRIVE_HOST) return null;
    return extractFolderIdFromUrl(u);
  } catch {
    return null;
  }
}

export type OrgDocumentsConfig = {
  folderUrl: string;
  folderId: string;
};

/**
 * Returns null if AP_GOOGLE_DRIVE_FOLDER_URL is unset or not a valid Drive folder reference.
 */
export function getOrgDocumentsConfig(): OrgDocumentsConfig | null {
  const raw = process.env.AP_GOOGLE_DRIVE_FOLDER_URL?.trim();
  if (!raw) return null;

  const folderId = extractFolderId(raw);
  if (!folderId) return null;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== DRIVE_HOST) return null;
      return { folderUrl: u.toString(), folderId };
    } catch {
      return null;
    }
  }

  return {
    folderUrl: `https://${DRIVE_HOST}/drive/folders/${encodeURIComponent(folderId)}`,
    folderId,
  };
}

export function getOrgDocumentsEmbedSrc(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
}
