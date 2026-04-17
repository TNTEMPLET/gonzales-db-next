"use client";

import { useEffect, useMemo, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
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
};

type AdminAuditLog = {
  id: string;
  action: "PROMOTE" | "DEMOTE";
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

export default function AdminUsersManager() {
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
  const [adminSearch, setAdminSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [logSearchInput, setLogSearchInput] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logFromDate, setLogFromDate] = useState("");
  const [logToDate, setLogToDate] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(25);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logPage, logPageSize, logQuery, logFromDate, logToDate]);

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
      const response = await fetch("/api/admin/users", {
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
      const response = await fetch(`/api/admin/users/${userId}`, {
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
      const response = await fetch("/api/admin/users", {
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

  async function confirmAndRunAction() {
    if (!confirmAction) return;

    if (confirmAction.kind === "promote") {
      await promoteUser(confirmAction.userId);
    } else {
      await demoteAdmin(confirmAction.adminId, confirmAction.email);
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
                return (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between gap-3 px-3 py-3 border-b border-zinc-800 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {admin.name || "Unnamed Admin"}
                      </p>
                      <p className="text-xs text-zinc-500">{admin.email}</p>
                    </div>
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
                  <div>
                    <p className="text-sm font-medium">
                      {user.firstName || user.lastName
                        ? [user.firstName, user.lastName]
                            .filter(Boolean)
                            .join(" ")
                        : user.name || "Unnamed User"}
                    </p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleCoach(user.id, user.isCoach)}
                      className={`text-xs rounded-lg border px-3 py-1.5 disabled:opacity-60 ${
                        user.isCoach
                          ? "border-brand-purple text-brand-purple hover:bg-brand-purple/10"
                          : "border-zinc-600 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      {user.isCoach ? "Revoke Coach" : "Grant Coach"}
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
                      className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-1.5 disabled:opacity-60"
                    >
                      Promote
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
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
