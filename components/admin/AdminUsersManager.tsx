"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isMaster: boolean;
  createdAt: string;
};

type RegisteredUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  googleSub: string | null;
  createdAt: string;
  updatedAt: string;
  isAdmin: boolean;
  isCoach: boolean;
  isBlocked: boolean;
};

type AdminAuditLog = {
  id: string;
  action:
    | "PROMOTE"
    | "DEMOTE"
    | "BLOCK"
    | "UNBLOCK"
    | "REMOVE"
    | "GRANT_MASTER"
    | "REVOKE_MASTER";
  actorEmail: string;
  targetEmail: string;
  targetName: string | null;
  sourcePath: string | null;
  requestIp: string | null;
  createdAt: string;
};

type AuditLogsMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: string;
  from: string | null;
  to: string | null;
};

type ApiResponse = {
  admins: AdminUser[];
  auditLogs: AdminAuditLog[];
  auditLogsMeta: AuditLogsMeta;
  currentAdminEmail: string | null;
  currentAdminIsMaster: boolean;
  isMasterDeployment: boolean;
  data: RegisteredUser[];
};

type ConfirmAction =
  | {
      kind: "promote";
      userId: string;
      label: string;
    }
  | {
      kind: "demote";
      adminId: string;
      email: string;
      label: string;
    }
  | {
      kind: "grantMaster";
      adminId: string;
      email: string;
      label: string;
    }
  | {
      kind: "revokeMaster";
      adminId: string;
      email: string;
      label: string;
    }
  | {
      kind: "block";
      userId: string;
      email: string;
      label: string;
    }
  | {
      kind: "unblock";
      userId: string;
      email: string;
      label: string;
    }
  | {
      kind: "remove";
      userId: string;
      email: string;
      label: string;
    }
  | null;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isoToDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toIsoFromDateInput(value: string, endOfDay = false) {
  if (!value) return "";
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return `${value}${suffix}`;
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function AdminUsersManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const orgQuery = `org=${targetOrg}`;
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditMeta, setAuditMeta] = useState<AuditLogsMeta>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    query: "",
    from: null,
    to: null,
  });
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string | null>(
    null,
  );
  const [currentAdminIsMaster, setCurrentAdminIsMaster] = useState(false);
  const [isMasterDeployment, setIsMasterDeployment] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [logSearchInput, setLogSearchInput] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logFromDate, setLogFromDate] = useState("");
  const [logToDate, setLogToDate] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(25);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [editingUser, setEditingUser] = useState<RegisteredUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, logPage, logPageSize, logQuery, logFromDate, logToDate]);

  const nonAdminRegisteredUsers = useMemo(
    () => registeredUsers.filter((user) => !user.isAdmin),
    [registeredUsers],
  );

  const filteredAdmins = useMemo(() => {
    const term = adminSearch.trim().toLowerCase();
    if (!term) return admins;
    return admins.filter((admin) => {
      const haystack = `${admin.name || ""} ${admin.email}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [admins, adminSearch]);

  const filteredRegisteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return nonAdminRegisteredUsers;
    return nonAdminRegisteredUsers.filter((user) => {
      const haystack = `${user.name || ""} ${user.email}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [nonAdminRegisteredUsers, userSearch]);

  async function loadData() {
    setBusy(true);
    setError("");

    try {
      const params = new URLSearchParams({
        logPage: String(logPage),
        logPageSize: String(logPageSize),
      });

      if (logQuery.trim()) params.set("logQuery", logQuery.trim());
      if (logFromDate) params.set("logFrom", toIsoFromDateInput(logFromDate));
      if (logToDate) params.set("logTo", toIsoFromDateInput(logToDate, true));

      params.set("org", targetOrg);
      const response = await fetch(`/api/admin/users?${params.toString()}`);
      const json = (await response.json()) as ApiResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          json && "error" in json ? json.error : "Failed to load users",
        );
      }

      const payload = json as ApiResponse;
      setAdmins(payload.admins || []);
      setAuditLogs(payload.auditLogs || []);
      setAuditMeta(
        payload.auditLogsMeta || {
          page: 1,
          pageSize: logPageSize,
          total: 0,
          totalPages: 1,
          query: logQuery,
          from: null,
          to: null,
        },
      );
      setRegisteredUsers(payload.data || []);
      setCurrentAdminEmail(payload.currentAdminEmail || null);
      setCurrentAdminIsMaster(Boolean(payload.currentAdminIsMaster));
      setIsMasterDeployment(Boolean(payload.isMasterDeployment));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setBusy(false);
    }
  }

  async function promoteUser(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-source-path": window.location.pathname,
        },
        body: JSON.stringify({ userId }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to promote user");
      }

      setNotice(`Promoted ${json.admin?.email || "user"} to admin.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to promote user");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCoach(userId: string, currentIsCoach: boolean) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${userId}?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCoach: !currentIsCoach }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json && "error" in json
            ? json.error
            : "Failed to update coach access",
        );
      }

      setNotice(
        !currentIsCoach ? "Coach access granted." : "Coach access revoked.",
      );
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update coach access",
      );
    } finally {
      setBusy(false);
    }
  }

  async function demoteAdmin(adminId: string, adminEmail: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-source-path": window.location.pathname,
        },
        body: JSON.stringify({ adminId }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to demote admin");
      }

      setNotice(`Demoted ${adminEmail} from admin.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to demote admin");
    } finally {
      setBusy(false);
    }
  }

  async function setMasterAdmin(
    adminId: string,
    adminEmail: string,
    nextIsMaster: boolean,
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-source-path": window.location.pathname,
        },
        body: JSON.stringify({ adminId, isMaster: nextIsMaster }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to update master admin");
      }

      setNotice(
        nextIsMaster
          ? `Granted master admin access to ${adminEmail}.`
          : `Revoked master admin access from ${adminEmail}.`,
      );
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update master admin",
      );
    } finally {
      setBusy(false);
    }
  }

  async function blockUser(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${userId}?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: true }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json && "error" in json ? json.error : "Failed to block user",
        );
      }

      setNotice("User account blocked.");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to block user");
    } finally {
      setBusy(false);
    }
  }

  async function unblockUser(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${userId}?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: false }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json && "error" in json ? json.error : "Failed to unblock user",
        );
      }

      setNotice("User account unblocked.");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unblock user");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users/${userId}?${orgQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to remove user");
      }

      setNotice(`Removed ${json.removed?.email || "user"} account.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setBusy(false);
    }
  }

  function openEditName(user: RegisteredUser) {
    setError("");
    setNotice("");
    setEditingUser(user);
    setEditFirstName(user.firstName || "");
    setEditLastName(user.lastName || "");
  }

  function closeEditName() {
    if (busy) return;
    setEditingUser(null);
    setEditFirstName("");
    setEditLastName("");
  }

  async function saveUserName() {
    if (!editingUser) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/users/${editingUser.id}?${orgQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: editFirstName,
            lastName: editLastName,
          }),
        },
      );
      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json && "error" in json ? json.error : "Failed to update user name",
        );
      }

      setNotice(`Updated name for ${editingUser.email}.`);
      setEditingUser(null);
      setEditFirstName("");
      setEditLastName("");
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update user name",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndRunAction() {
    if (!confirmAction) return;

    if (confirmAction.kind === "promote") {
      await promoteUser(confirmAction.userId);
    } else if (confirmAction.kind === "demote") {
      await demoteAdmin(confirmAction.adminId, confirmAction.email);
    } else if (confirmAction.kind === "grantMaster") {
      await setMasterAdmin(confirmAction.adminId, confirmAction.email, true);
    } else if (confirmAction.kind === "revokeMaster") {
      await setMasterAdmin(confirmAction.adminId, confirmAction.email, false);
    } else if (confirmAction.kind === "block") {
      await blockUser(confirmAction.userId);
    } else if (confirmAction.kind === "unblock") {
      await unblockUser(confirmAction.userId);
    } else if (confirmAction.kind === "remove") {
      await removeUser(confirmAction.userId);
    }

    setConfirmAction(null);
  }

  function applyLogFilters() {
    setLogPage(1);
    setLogQuery(logSearchInput.trim());
  }

  function clearLogFilters() {
    setLogSearchInput("");
    setLogQuery("");
    setLogFromDate("");
    setLogToDate("");
    setLogPage(1);
  }

  function exportAuditCsv() {
    if (auditLogs.length === 0) return;

    const header = [
      "Timestamp",
      "Action",
      "Actor Email",
      "Target Email",
      "Target Name",
      "Source Path",
      "Request IP",
    ];

    const rows = auditLogs.map((log) => [
      formatDateTime(log.createdAt),
      log.action,
      log.actorEmail,
      log.targetEmail,
      log.targetName || "",
      log.sourcePath || "",
      log.requestIp || "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-audit-log-page-${auditMeta.page}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Admin Accounts</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Active admin users who can access admin pages.
            </p>
          </div>

          <input
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
            placeholder="Search admins by name or email"
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />

          <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
            {filteredAdmins.length === 0 ? (
              <p className="text-zinc-500 text-sm p-3">No admin users found.</p>
            ) : (
              filteredAdmins.map((admin) => {
                const isCurrent = currentAdminEmail === admin.email;
                const canManageMaster =
                  isMasterDeployment && currentAdminIsMaster;
                return (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between gap-3 px-3 py-3 border-b border-zinc-800 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {admin.name || "Unnamed Admin"}
                        {admin.isMaster ? (
                          <span
                            className="inline-flex items-center justify-center h-5 w-5 rounded-md border border-red-500/80 bg-amber-300 text-red-700"
                            title="Master Admin"
                            aria-label="Master Admin"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M12 2 4 5.5l1.4 8.1L12 22l6.6-8.4L20 5.5 12 2Zm0 2.3 5.5 2.4-1 6.1L12 18.6l-4.5-5.8-1-6.1L12 4.3Z" />
                              <path d="M15.7 8.7c-.7-.5-1.7-.8-2.8-.8-2 0-3.4.9-3.4 2.4 0 1.3 1 1.9 2.6 2.2l1 .2c.9.2 1.3.4 1.3.8 0 .5-.6.8-1.5.8-1 0-2-.4-2.7-1l-1 1.4c.9.8 2.2 1.2 3.7 1.2 2.1 0 3.5-.9 3.5-2.5 0-1.2-.8-1.9-2.4-2.2l-1.1-.2c-.9-.2-1.3-.4-1.3-.8 0-.5.6-.8 1.4-.8.9 0 1.6.3 2.1.7l.6-1.4Z" />
                            </svg>
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-zinc-500">{admin.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManageMaster ? (
                        admin.isMaster ? (
                          <button
                            type="button"
                            disabled={busy || isCurrent}
                            onClick={() =>
                              setConfirmAction({
                                kind: "revokeMaster",
                                adminId: admin.id,
                                email: admin.email,
                                label: `Remove master admin access from ${admin.email}?`,
                              })
                            }
                            className="text-xs rounded-lg border border-amber-700 text-amber-300 hover:bg-amber-950/40 px-3 py-1.5 disabled:opacity-60"
                          >
                            Revoke Master
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setConfirmAction({
                                kind: "grantMaster",
                                adminId: admin.id,
                                email: admin.email,
                                label: `Grant master admin access to ${admin.email}?`,
                              })
                            }
                            className="text-xs rounded-lg border border-amber-600 text-amber-300 hover:bg-amber-950/40 px-3 py-1.5 disabled:opacity-60"
                          >
                            Make Master
                          </button>
                        )
                      ) : null}
                      {isCurrent ? (
                        <span className="text-[11px] rounded-full px-2 py-1 border border-zinc-700 text-zinc-400">
                          You
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setConfirmAction({
                              kind: "demote",
                              adminId: admin.id,
                              email: admin.email,
                              label: `Demote ${admin.email} from admin access?`,
                            })
                          }
                          className="text-xs rounded-lg border border-red-700 text-red-300 hover:bg-red-950/40 px-3 py-1.5 disabled:opacity-60"
                        >
                          Demote
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Registered Users</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Users are listed here after successful Google sign-in.
            </p>
          </div>

          <input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search users by name or email"
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />

          <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
            {filteredRegisteredUsers.length === 0 ? (
              <p className="text-zinc-500 text-sm p-3">
                No users waiting for promotion.
              </p>
            ) : (
              filteredRegisteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 px-3 py-3 border-b border-zinc-800 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {user.firstName || user.lastName
                        ? [user.firstName, user.lastName]
                            .filter(Boolean)
                            .join(" ")
                        : user.name || "Unnamed User"}
                    </p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                    {user.isBlocked && (
                      <p className="text-xs text-red-400 mt-1">🚫 Blocked</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openEditName(user)}
                      title="Edit name"
                      aria-label="Edit name"
                      className="rounded-lg border border-blue-700 text-blue-300 hover:bg-blue-950/40 px-2.5 py-1.5 disabled:opacity-60"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 0 1 2.828 2.828L11.828 15.828a2 2 0 0 1-1.414.586H8v-2.414a2 2 0 0 1 .586-1.414Z"
                        />
                        <path strokeLinecap="round" d="M3 21h18" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleCoach(user.id, user.isCoach)}
                      title={user.isCoach ? "Revoke Coach" : "Grant Coach"}
                      aria-label={user.isCoach ? "Revoke Coach" : "Grant Coach"}
                      className={`rounded-lg border px-2.5 py-1.5 disabled:opacity-60 ${
                        user.isCoach
                          ? "border-brand-purple text-brand-purple hover:bg-brand-purple/10"
                          : "border-zinc-600 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      {user.isCoach ? (
                        /* Baseball cap with strikethrough line */
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 14h14a1 1 0 0 0 1-1V9a7 7 0 0 0-7-7H9a6 6 0 0 0-6 6v6Z"
                          />
                          <path
                            strokeLinecap="round"
                            d="M3 14v1a2 2 0 0 0 2 2h12"
                          />
                          <path strokeLinecap="round" d="M10 7v4" />
                          <line
                            x1="3"
                            y1="3"
                            x2="21"
                            y2="21"
                            strokeLinecap="round"
                            strokeWidth={1.8}
                          />
                        </svg>
                      ) : (
                        /* Baseball cap */
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 14h14a1 1 0 0 0 1-1V9a7 7 0 0 0-7-7H9a6 6 0 0 0-6 6v6Z"
                          />
                          <path
                            strokeLinecap="round"
                            d="M3 14v1a2 2 0 0 0 2 2h12"
                          />
                          <path strokeLinecap="round" d="M10 7v4" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setConfirmAction({
                          kind: "promote",
                          userId: user.id,
                          label: `Promote ${user.email} to admin access?`,
                        })
                      }
                      title="Promote to Admin"
                      aria-label="Promote to Admin"
                      className="rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-2.5 py-1.5 disabled:opacity-60"
                    >
                      {/* Avengers-style "A" */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 3 L5 20 M12 3 L19 20"
                        />
                        <path strokeLinecap="round" d="M7.5 14.5 h9" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 3 L10 7 L14 7 Z"
                        />
                      </svg>
                    </button>
                    <span
                      className="w-px self-stretch bg-zinc-700 mx-1"
                      aria-hidden="true"
                    />
                    {user.isBlocked ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirmAction({
                            kind: "unblock",
                            userId: user.id,
                            email: user.email,
                            label: `Unblock ${user.email}?`,
                          })
                        }
                        aria-label="Unblock"
                        title="Unblock"
                        className="text-xs rounded-lg border border-amber-600 text-amber-300 hover:bg-amber-950/40 px-2.5 py-1.5 disabled:opacity-60"
                      >
                        🛡
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setConfirmAction({
                            kind: "block",
                            userId: user.id,
                            email: user.email,
                            label: `Block ${user.email}?`,
                          })
                        }
                        aria-label="Block"
                        title="Block"
                        className="text-xs rounded-lg border border-amber-600 text-amber-300 hover:bg-amber-950/40 px-2.5 py-1.5 disabled:opacity-60"
                      >
                        🛡
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setConfirmAction({
                          kind: "remove",
                          userId: user.id,
                          email: user.email,
                          label: `Permanently remove ${user.email}? This will delete all posts and comments.`,
                        })
                      }
                      aria-label="Remove"
                      title="Remove"
                      className="text-xs rounded-lg border border-red-700 text-red-300 hover:bg-red-950/60 px-2.5 py-1.5 disabled:opacity-60"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">Admin Audit Log</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Promotion and demotion events with actor, source page, and request
              IP.
            </p>
          </div>
          <button
            type="button"
            disabled={auditLogs.length === 0}
            onClick={exportAuditCsv}
            className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-1.5 disabled:opacity-60"
          >
            Export CSV (Current Page)
          </button>
        </div>

        <div className="grid md:grid-cols-[1fr_160px_160px_auto_auto] gap-3">
          <input
            value={logSearchInput}
            onChange={(event) => setLogSearchInput(event.target.value)}
            placeholder="Search logs by action, actor, target, source, or IP"
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={logFromDate}
            onChange={(event) => setLogFromDate(event.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={logToDate}
            onChange={(event) => setLogToDate(event.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={applyLogFilters}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearLogFilters}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Clear
          </button>
        </div>

        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
          {auditLogs.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">
              No audit events found for current filters.
            </p>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-3 py-3 border-b border-zinc-800 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {log.action === "PROMOTE" ? "Promoted" : "Demoted"}{" "}
                    {log.targetEmail}
                  </p>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Actor: {log.actorEmail}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Source: {log.sourcePath || "Unknown"} | IP:{" "}
                  {log.requestIp || "Unknown"}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Showing page {auditMeta.page} of {auditMeta.totalPages} (
            {auditMeta.total} total events)
          </p>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Page size</label>
            <select
              value={logPageSize}
              onChange={(event) => {
                setLogPage(1);
                setLogPageSize(Number(event.target.value));
              }}
              className="rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || logPage <= 1}
              onClick={() => setLogPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-60"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={busy || logPage >= auditMeta.totalPages}
              onClick={() =>
                setLogPage((prev) => Math.min(auditMeta.totalPages, prev + 1))
              }
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-lg font-semibold">Confirm Action</h3>
            <p className="text-sm text-zinc-300">{confirmAction.label}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmAndRunAction}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                  confirmAction.kind === "promote"
                    ? "bg-brand-gold hover:bg-brand-gold/90 text-black"
                    : confirmAction.kind === "demote"
                      ? "bg-brand-purple hover:bg-brand-purple-dark"
                      : confirmAction.kind === "block"
                        ? "bg-red-700 hover:bg-red-800"
                        : confirmAction.kind === "unblock"
                          ? "bg-emerald-700 hover:bg-emerald-800"
                          : "bg-red-900 hover:bg-red-950"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-lg font-semibold">Edit User Name</h3>
            <p className="text-sm text-zinc-400">{editingUser.email}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={editFirstName}
                onChange={(event) => setEditFirstName(event.target.value)}
                placeholder="First name"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={editLastName}
                onChange={(event) => setEditLastName(event.target.value)}
                placeholder="Last name"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditName}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveUserName()}
                className="rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
