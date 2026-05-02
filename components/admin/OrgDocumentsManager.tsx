"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import DriveFolderEmbed from "@/components/admin/DriveFolderEmbed";

const ROOT_FOLDER_LABEL = "Organization folder";

type DriveFileRow = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

type DrivePermissionRow = {
  id: string;
  type: string;
  role?: string;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

type FileSortKey = "name" | "type" | "modified" | "size";

function sortFileRows(
  rows: DriveFileRow[],
  sortKey: FileSortKey,
  sortDir: "asc" | "desc",
): DriveFileRow[] {
  const copy = [...rows];
  const dir = sortDir === "asc" ? 1 : -1;

  copy.sort((a, b) => {
    const aFolder = a.mimeType === FOLDER_MIME;
    const bFolder = b.mimeType === FOLDER_MIME;

    const byName = () => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    if (sortKey === "name") {
      if (sortDir === "asc") {
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
      } else if (aFolder !== bFolder) {
        return aFolder ? 1 : -1;
      }
      return dir * byName();
    }

    if (sortKey === "type") {
      if (sortDir === "asc") {
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
      } else if (aFolder !== bFolder) {
        return aFolder ? 1 : -1;
      }
      const ta = aFolder ? "folder" : a.mimeType;
      const tb = bFolder ? "folder" : b.mimeType;
      const cmp = ta.localeCompare(tb, undefined, { sensitivity: "base" });
      if (cmp !== 0) return dir * cmp;
      return byName();
    }

    if (sortKey === "modified") {
      const parse = (iso?: string) => {
        if (!iso) return null;
        const t = new Date(iso).getTime();
        return Number.isFinite(t) ? t : null;
      };
      const ta = parse(a.modifiedTime);
      const tb = parse(b.modifiedTime);
      const na =
        ta === null
          ? sortDir === "asc"
            ? Number.POSITIVE_INFINITY
            : Number.NEGATIVE_INFINITY
          : ta;
      const nb =
        tb === null
          ? sortDir === "asc"
            ? Number.POSITIVE_INFINITY
            : Number.NEGATIVE_INFINITY
          : tb;
      if (na !== nb) return dir * (na - nb);
      return byName();
    }

    if (sortKey === "size") {
      if (aFolder !== bFolder) return aFolder ? 1 : -1;
      const na = Number(a.size);
      const nb = Number(b.size);
      const va = Number.isFinite(na) ? na : 0;
      const vb = Number.isFinite(nb) ? nb : 0;
      if (va !== vb) return dir * (va - vb);
      return byName();
    }

    return 0;
  });

  return copy;
}

const SHARE_ROLE_OPTIONS = [
  { value: "reader", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "writer", label: "Editor" },
  { value: "fileOrganizer", label: "File organizer" },
  { value: "organizer", label: "Organizer (full access)" },
];

type OrgDocumentsManagerProps = {
  folderId: string;
  folderUrl: string;
  driveApiEnabled: boolean;
  canManageSharing: boolean;
};

export default function OrgDocumentsManager({
  folderId,
  folderUrl,
  driveApiEnabled,
  canManageSharing,
}: OrgDocumentsManagerProps) {
  const [pathStack, setPathStack] = useState<{ id: string; name: string }[]>(() => [
    { id: folderId, name: ROOT_FOLDER_LABEL },
  ]);
  const [files, setFiles] = useState<DriveFileRow[]>([]);
  const [permissions, setPermissions] = useState<DrivePermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [permLoading, setPermLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [permError, setPermError] = useState("");
  const [notice, setNotice] = useState("");

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("reader");
  const [shareBusy, setShareBusy] = useState(false);
  const [sortKey, setSortKey] = useState<FileSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const currentFolderId = pathStack[pathStack.length - 1]!.id;

  const sortedFiles = useMemo(
    () => sortFileRows(files, sortKey, sortDir),
    [files, sortKey, sortDir],
  );

  function handleSortHeaderClick(key: FileSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const loadPermissions = useCallback(async () => {
    if (!driveApiEnabled) return;
    setPermLoading(true);
    setPermError("");
    try {
      const permRes = await fetch(
        `/api/admin/documents/permissions?folderId=${encodeURIComponent(folderId)}`,
        { cache: "no-store" },
      );
      const permJson = (await permRes.json()) as {
        error?: string;
        data?: DrivePermissionRow[];
      };
      if (!permRes.ok) {
        throw new Error(permJson.error || "Failed to load permissions");
      }
      setPermissions(permJson.data ?? []);
    } catch (e: unknown) {
      setPermError(e instanceof Error ? e.message : "Failed to load permissions");
    } finally {
      setPermLoading(false);
    }
  }, [driveApiEnabled, folderId]);

  const loadFiles = useCallback(async () => {
    if (!driveApiEnabled) return;
    setLoading(true);
    setFilesError("");
    try {
      const filesRes = await fetch(
        `/api/admin/documents/files?folderId=${encodeURIComponent(currentFolderId)}`,
        { cache: "no-store" },
      );
      const filesJson = (await filesRes.json()) as {
        error?: string;
        data?: DriveFileRow[];
      };
      if (!filesRes.ok) {
        throw new Error(filesJson.error || "Failed to load files");
      }
      setFiles(filesJson.data ?? []);
    } catch (e: unknown) {
      setFilesError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [driveApiEnabled, currentFolderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async permission load
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async file listing load
    void loadFiles();
  }, [loadFiles]);

  async function addShare(e: FormEvent) {
    e.preventDefault();
    if (!canManageSharing) return;
    setShareBusy(true);
    setPermError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/documents/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: shareEmail.trim(),
          role: shareRole,
          sendNotificationEmail: true,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to add access");
      }
      setNotice(`Access granted for ${shareEmail.trim()}.`);
      setShareEmail("");
      await loadPermissions();
    } catch (err: unknown) {
      setPermError(err instanceof Error ? err.message : "Failed to add access");
    } finally {
      setShareBusy(false);
    }
  }

  async function removeShare(permissionId: string) {
    if (!canManageSharing) return;
    if (!confirm("Remove this person’s access to the folder?")) return;
    setPermError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/documents/permissions?permissionId=${encodeURIComponent(permissionId)}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to remove access");
      }
      setNotice("Access removed.");
      await loadPermissions();
    } catch (err: unknown) {
      setPermError(err instanceof Error ? err.message : "Failed to remove access");
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function formatSize(bytes?: string) {
    if (!bytes) return "—";
    const n = Number(bytes);
    if (!Number.isFinite(n)) return bytes;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-10">
      {driveApiEnabled ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Folder contents</h2>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <nav
                aria-label="Folder path"
                className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-zinc-300"
              >
                {pathStack.map((seg, i) => (
                  <span key={`${seg.id}-${i}`} className="inline-flex items-center gap-1">
                    {i > 0 ? (
                      <span className="text-zinc-600 select-none" aria-hidden>
                        /
                      </span>
                    ) : null}
                    {i < pathStack.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setPathStack((prev) => prev.slice(0, i + 1))}
                        className="text-[#2374E1] hover:underline text-left max-w-[200px] truncate"
                        title={seg.name}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span
                        className="font-medium text-zinc-100 max-w-[220px] truncate"
                        title={seg.name}
                      >
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
              {pathStack.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setPathStack((prev) => prev.slice(0, -1))}
                  className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  ↑ Up one level
                </button>
              ) : null}
            </div>
            {filesError ? (
              <p className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {filesError}
              </p>
            ) : null}
            {notice ? (
              <p className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                {notice}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th
                      className="px-3 py-2 font-medium"
                      scope="col"
                      aria-sort={
                        sortKey === "name"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("name")}
                        className="inline-flex items-center gap-1 rounded font-medium text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1]"
                      >
                        Name
                        {sortKey === "name" ? (
                          <span aria-hidden className="text-zinc-300">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <span className="text-zinc-600 opacity-60" aria-hidden>
                            ↕
                          </span>
                        )}
                      </button>
                    </th>
                    <th
                      className="px-3 py-2 font-medium"
                      scope="col"
                      aria-sort={
                        sortKey === "type"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("type")}
                        className="inline-flex items-center gap-1 rounded font-medium text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1]"
                      >
                        Type
                        {sortKey === "type" ? (
                          <span aria-hidden className="text-zinc-300">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <span className="text-zinc-600 opacity-60" aria-hidden>
                            ↕
                          </span>
                        )}
                      </button>
                    </th>
                    <th
                      className="px-3 py-2 font-medium"
                      scope="col"
                      aria-sort={
                        sortKey === "modified"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("modified")}
                        className="inline-flex items-center gap-1 rounded font-medium text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1]"
                      >
                        Modified
                        {sortKey === "modified" ? (
                          <span aria-hidden className="text-zinc-300">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <span className="text-zinc-600 opacity-60" aria-hidden>
                            ↕
                          </span>
                        )}
                      </button>
                    </th>
                    <th
                      className="px-3 py-2 font-medium text-right whitespace-nowrap"
                      scope="col"
                      aria-sort={
                        sortKey === "size"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("size")}
                        className="inline-flex w-full items-center justify-end gap-1 rounded font-medium text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1]"
                      >
                        Size
                        {sortKey === "size" ? (
                          <span aria-hidden className="text-zinc-300">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        ) : (
                          <span className="text-zinc-600 opacity-60" aria-hidden>
                            ↕
                          </span>
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-zinc-500 text-center">
                        Loading…
                      </td>
                    </tr>
                  ) : files.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-zinc-500 text-center">
                        No items in this folder (or empty after filters).
                      </td>
                    </tr>
                  ) : (
                    sortedFiles.map((f) => {
                      const isFolder = f.mimeType === FOLDER_MIME;
                      const openHref = `/api/admin/documents/open?fileId=${encodeURIComponent(f.id)}`;
                      const enterFolder = () =>
                        setPathStack((prev) => [...prev, { id: f.id, name: f.name }]);

                      return (
                      <tr key={f.id} className="text-zinc-200 hover:bg-zinc-900/50">
                        <td className="px-3 py-2 wrap-break-word max-w-[240px]">
                          {isFolder ? (
                            <button
                              type="button"
                              onClick={enterFolder}
                              className="inline-flex items-start gap-1.5 text-left font-medium text-zinc-200 hover:text-[#2374E1] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1] rounded-sm"
                              title="Open this folder here"
                            >
                              <span aria-hidden className="shrink-0">
                                📁
                              </span>
                              <span className="wrap-break-word min-w-0">{f.name}</span>
                            </button>
                          ) : (
                            <a
                              href={openHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block font-medium text-[#2374E1] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2374E1] rounded-sm wrap-break-word max-w-full"
                              title="Open in Google Drive (new tab)"
                            >
                              {f.name}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 text-zinc-400 text-xs">
                          {isFolder
                            ? "Folder"
                            : f.mimeType.replace("application/", "").slice(0, 32)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 whitespace-nowrap text-xs">
                          {formatDate(f.modifiedTime)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 text-right text-xs">
                          {isFolder ? "—" : formatSize(f.size)}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Click <strong>Name</strong>, <strong>Type</strong>, <strong>Modified</strong>, or{" "}
              <strong>Size</strong> to sort; click again to reverse. Listing uses the service account.{" "}
              <strong>Click a folder name</strong> (or focus it and
              press <kbd className="rounded border border-zinc-600 px-1">Enter</kbd>) to move into it;
              use the path or <strong>Up one level</strong> to go back. <strong>Files</strong>: click the
              file name to open in a new tab to Google (
              <kbd className="rounded border border-zinc-600 px-1">Enter</kbd> when the name link is
              focused). You need a matching Google session and Drive permission (typically your{" "}
              <code className="text-zinc-400">@apbaseball.com</code> account after signing in with
              Google on the admin login page at least once).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Folder access</h2>
            {permError ? (
              <p className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {permError}
              </p>
            ) : null}
            <p className="text-sm text-zinc-500 mb-4">
              People and groups who can open this folder in Google Drive.{" "}
              {canManageSharing
                ? "As a master admin, you can invite users by email."
                : "Only master admins can add or remove sharing."}
            </p>

            {canManageSharing ? (
              <form
                onSubmit={(e) => void addShare(e)}
                className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <label className="block flex-1 min-w-[200px]">
                  <span className="text-xs font-medium text-zinc-400">Email</span>
                  <input
                    type="email"
                    required
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="coach@example.com"
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
                <label className="block w-full sm:w-48">
                  <span className="text-xs font-medium text-zinc-400">Role</span>
                  <select
                    value={shareRole}
                    onChange={(e) => setShareRole(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  >
                    {SHARE_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={shareBusy || permLoading}
                  className="rounded-lg bg-[#2374E1] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1864D7] disabled:opacity-50"
                >
                  {shareBusy ? "Adding…" : "Grant access"}
                </button>
              </form>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Who</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    {canManageSharing ? (
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {permLoading ? (
                    <tr>
                      <td
                        colSpan={canManageSharing ? 4 : 3}
                        className="px-3 py-6 text-zinc-500 text-center"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : permissions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManageSharing ? 4 : 3}
                        className="px-3 py-6 text-zinc-500 text-center"
                      >
                        No permissions returned (check service account access).
                      </td>
                    </tr>
                  ) : (
                    permissions.map((p) => {
                      const label =
                        p.emailAddress ||
                        p.displayName ||
                        (p.domain ? `Domain: ${p.domain}` : p.type);
                      const canRemove =
                        canManageSharing &&
                        p.role !== "owner" &&
                        p.type !== "anyone" &&
                        p.type !== "domain";

                      return (
                        <tr key={p.id} className="text-zinc-200">
                          <td className="px-3 py-2 wrap-break-word">{label}</td>
                          <td className="px-3 py-2 text-zinc-400 text-xs">{p.type}</td>
                          <td className="px-3 py-2 text-zinc-400 text-xs">{p.role ?? "—"}</td>
                          {canManageSharing ? (
                            <td className="px-3 py-2 text-right">
                              {canRemove ? (
                                <button
                                  type="button"
                                  onClick={() => void removeShare(p.id)}
                                  className="text-xs text-red-300 hover:underline"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-4 text-sm text-amber-100">
          <p className="font-semibold">Drive API not enabled</p>
          <p className="mt-2 text-amber-200/90">
            Add a Google Cloud service account JSON as{" "}
            <code className="text-amber-50">GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON</code> (full JSON on
            one line) or <code className="text-amber-50">GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64</code>.
            In Google Drive, share the AP Baseball folder with the service account’s client email
            (from the JSON) with at least <strong>Editor</strong> if admins should manage sharing, or{" "}
            <strong>Viewer</strong> to list files only.
          </p>
        </div>
      )}

      <details className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">
          Optional: embedded Google Drive preview
        </summary>
        <p className="mt-3 text-sm text-zinc-500 mb-3">
          The table above is the main browser. This iframe often still asks you to sign in to Google.{" "}
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2374E1] hover:underline"
          >
            Open folder in Google Drive
          </a>
        </p>
        <DriveFolderEmbed folderId={folderId} />
      </details>
    </div>
  );
}
