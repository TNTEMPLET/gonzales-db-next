"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import DriveFolderEmbed from "@/components/admin/DriveFolderEmbed";

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
  const [files, setFiles] = useState<DriveFileRow[]>([]);
  const [permissions, setPermissions] = useState<DrivePermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("reader");
  const [shareBusy, setShareBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!driveApiEnabled) return;
    setLoading(true);
    setError("");
    try {
      const [filesRes, permRes] = await Promise.all([
        fetch(`/api/admin/documents/files?folderId=${encodeURIComponent(folderId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/documents/permissions?folderId=${encodeURIComponent(folderId)}`, {
          cache: "no-store",
        }),
      ]);

      const filesJson = (await filesRes.json()) as {
        error?: string;
        data?: DriveFileRow[];
      };
      const permJson = (await permRes.json()) as {
        error?: string;
        data?: DrivePermissionRow[];
      };

      if (!filesRes.ok) {
        throw new Error(filesJson.error || "Failed to load files");
      }
      if (!permRes.ok) {
        throw new Error(permJson.error || "Failed to load permissions");
      }

      setFiles(filesJson.data ?? []);
      setPermissions(permJson.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load Drive data");
    } finally {
      setLoading(false);
    }
  }, [driveApiEnabled, folderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function addShare(e: FormEvent) {
    e.preventDefault();
    if (!canManageSharing) return;
    setShareBusy(true);
    setError("");
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
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add access");
    } finally {
      setShareBusy(false);
    }
  }

  async function removeShare(permissionId: string) {
    if (!canManageSharing) return;
    if (!confirm("Remove this person’s access to the folder?")) return;
    setError("");
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
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove access");
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
            {error ? (
              <p className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
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
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Modified</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                    <th className="px-3 py-2 font-medium text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-zinc-500 text-center">
                        Loading…
                      </td>
                    </tr>
                  ) : files.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-zinc-500 text-center">
                        No items in this folder (or empty after filters).
                      </td>
                    </tr>
                  ) : (
                    files.map((f) => (
                      <tr key={f.id} className="text-zinc-200 hover:bg-zinc-900/50">
                        <td className="px-3 py-2 font-medium wrap-break-word max-w-[240px]">
                          {f.mimeType === FOLDER_MIME ? "📁 " : ""}
                          {f.name}
                        </td>
                        <td className="px-3 py-2 text-zinc-400 text-xs">
                          {f.mimeType === FOLDER_MIME
                            ? "Folder"
                            : f.mimeType.replace("application/", "").slice(0, 32)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 whitespace-nowrap text-xs">
                          {formatDate(f.modifiedTime)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 text-right text-xs">
                          {f.mimeType === FOLDER_MIME ? "—" : formatSize(f.size)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <a
                            href={`/api/admin/documents/open?fileId=${encodeURIComponent(f.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#2374E1] hover:underline text-xs font-medium"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Listing uses the service account. <strong>Open</strong> sends you through this site to
              Google Drive in a new tab: you need a matching Google session and Drive permission for
              the file (typically your <code className="text-zinc-400">@apbaseball.com</code> account
              after signing in with Google on the admin login page at least once).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Folder access</h2>
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
                  disabled={shareBusy || loading}
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
                  {loading ? (
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
