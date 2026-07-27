"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_ROLES,
  type AdminRole,
  getAdminRoleLabel,
  suggestLeastPrivilegeRole,
  type AdminModule,
} from "@/lib/auth/adminRoles";
import { CONTENT_ORGS, type ContentOrgId, getOrgDisplayName } from "@/lib/siteConfig";

type AdminSummary = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  isMaster: boolean;
  orgRoles: Partial<Record<ContentOrgId, AdminRole>>;
};

type AuditEntry = {
  id: string;
  action: string;
  actorEmail: string;
  targetEmail: string;
  targetName: string | null;
  createdAt: string;
};

type RegisteredLite = {
  id: string;
  email: string;
  name: string | null;
};

const ALL_ORGS = [...CONTENT_ORGS] as const;

export default function AdminRoleAssignmentConsole({
  currentAdminEmail,
  isMasterAdmin,
}: {
  currentAdminEmail: string | null;
  isMasterAdmin: boolean;
}) {
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [registered, setRegistered] = useState<RegisteredLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Assignment form state
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // Use absence of key (or undefined) to mean "no access" for this org.
  // This avoids mixing string roles with the sentinel "" for TypeScript.
  const [orgRoles, setOrgRoles] = useState<Partial<Record<ContentOrgId, AdminRole>>>({});
  const [suggested, setSuggested] = useState<{ role: AdminRole; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const protectedEmail = "trent@apbaseball.com";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch admins + audit for each org in parallel (masters appear on all)
      const results = await Promise.all(
        ALL_ORGS.map(async (org) => {
          const res = await fetch(`/api/admin/users?org=${org}&logPageSize=10`, { cache: "no-store" });
          if (!res.ok) throw new Error(`Failed to load ${org}`);
          return res.json();
        }),
      );

      // Merge unique admins
      const byEmail = new Map<string, AdminSummary>();
      for (const r of results) {
        const org = (r as any).targetOrg || (r as any).org || ALL_ORGS[0]; // best effort
        for (const a of (r as any).admins || []) {
          const email = String(a.email || "").toLowerCase();
          if (!byEmail.has(email)) {
            byEmail.set(email, {
              id: a.id,
              email: a.email,
              name: a.name,
              role: a.role,
              isMaster: !!a.isMaster,
              orgRoles: {},
            });
          }
          const entry = byEmail.get(email)!;
          if (a.orgRole) {
            entry.orgRoles[org as ContentOrgId] = a.orgRole;
          }
          if (a.isMaster) entry.isMaster = true;
        }
      }

      const mergedAdmins = Array.from(byEmail.values()).sort((a, b) =>
        a.email.localeCompare(b.email),
      );
      setAdmins(mergedAdmins);

      // Collect recent audit from first response (they overlap)
      const firstAudit = (results[0] as any).auditLogs || [];
      setAudit(firstAudit.slice(0, 8));

      // Registered users from first org (good enough for selection)
      const first = results[0] as any;
      const regs: RegisteredLite[] = (first.data || [])
        .filter((u: any) => u && u.email)
        .map((u: any) => ({ id: u.id, email: u.email, name: u.name }));
      setRegistered(regs);
    } catch (e: any) {
      setError(e?.message || "Failed to load role data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentAdminIsProtected =
    currentAdminEmail?.trim().toLowerCase() === protectedEmail;

  const filteredAdmins = useMemo(() => {
    return admins;
  }, [admins]);

  function updateOrgRole(org: ContentOrgId, role: AdminRole | "") {
    setOrgRoles((prev) => {
      const next = { ...prev };
      if (!role) {
        delete next[org];
      } else {
        next[org] = role;
      }
      return next;
    });
  }

  function applySuggestion() {
    // Simple heuristic: base suggestion on whether the operator picked any high modules.
    // For a richer UX the console could let the operator pick target modules first.
    // Here we give a default sensible suggestion and let the master override.
    const suggestion = suggestLeastPrivilegeRole(["TEAMS", "USERS", "VOLUNTEERS"]);
    setSuggested(suggestion);

    // Pre-fill a reasonable default for all orgs (master can change per org)
    const defaultRole = suggestion.role;
    const next: Partial<Record<ContentOrgId, AdminRole>> = {};
    for (const o of ALL_ORGS) next[o] = defaultRole;
    setOrgRoles(next);
  }

  async function submitAssignment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    const email = (targetEmail || "").trim().toLowerCase();
    if (!email) {
      setError("Enter a user email or select one from the list.");
      setBusy(false);
      return;
    }

    if (email === protectedEmail && !currentAdminIsProtected) {
      setError("The protected master account can only be managed by itself.");
      setBusy(false);
      return;
    }

    try {
      // 1) Try to find or promote the user (POST /api/admin/users)
      // We call promote for each org where a role is chosen.
      // The promote endpoint accepts a userId. If we only have email we first look up or let the backend upsert by email.

      // Strategy:
      // - If we have a selectedUserId, use it.
      // - Otherwise do a lightweight lookup via the users list we already have, or call promote with a best-effort.

      // The promote path in the API accepts { userId, role } and will create AdminUser + membership.
      // For masters we can promote to ADMIN (or higher) on specific orgs.

      let userId = selectedUserId;

      if (!userId) {
        // Try to find in the loaded registered list
        const match = registered.find((r) => r.email.toLowerCase() === email);
        if (match) userId = match.id;
      }

      // If still no id, we can attempt promote using the email by first ensuring the registered user exists.
      // For simplicity in this focused console we require the user to exist in RegisteredUser.
      if (!userId) {
        setError("User not found in the registered directory for this platform. Add the account first or use the full People hub.");
        setBusy(false);
        return;
      }

      // Apply roles per org
      // orgRoles now uses absence of key (or undefined) to mean "no access for this org".
      const entries = Object.entries(orgRoles).filter(([, r]) => !!r);
      if (entries.length === 0) {
        setError("Select at least one organization and role.");
        setBusy(false);
        return;
      }

      for (const [org, role] of entries) {
        if (!role) continue;

        // Use the promote endpoint (creates membership or updates)
        const res = await fetch(`/api/admin/users?org=${org}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Failed to assign ${role} on ${org}`);
        }
      }

      setNotice("Role assignment(s) saved. Audit log updated.");
      setTargetEmail("");
      setSelectedUserId(null);
      setOrgRoles({});
      setSuggested(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  function quickSuggestForPersona(persona: string) {
    let mods: AdminModule[] = ["TEAMS", "USERS", "VOLUNTEERS"];
    if (persona === "scorekeeper") mods = ["SCORES", "REPORTS"];
    if (persona === "board") mods = ["SCORES", "DUGOUT_MODERATION", "ALL_STAR_PAYMENTS"];
    if (persona === "platform") mods = ["ROLE_ASSIGNMENT", "TOURNAMENT_BRACKETS"];

    const s = suggestLeastPrivilegeRole(mods);
    setSuggested(s);

    const next: Partial<Record<ContentOrgId, AdminRole>> = {};
    for (const o of ALL_ORGS) next[o] = s.role;
    setOrgRoles(next);
  }

  return (
    <div className="space-y-8">
      {/* Current Admins Overview */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Current Admin Access</h2>
          <button
            onClick={() => void load()}
            className="text-xs text-zinc-400 hover:text-zinc-200"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : filteredAdmins.length === 0 ? (
          <p className="text-sm text-zinc-500">No admin records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Global</th>
                  {ALL_ORGS.map((o) => (
                    <th key={o} className="px-3 py-2">{getOrgDisplayName(o)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {filteredAdmins.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-900/60">
                    <td className="px-3 py-2 font-medium text-zinc-100">{a.email}</td>
                    <td className="px-3 py-2">
                      {a.isMaster ? (
                        <span className="rounded bg-red-950/60 px-2 py-0.5 text-xs text-red-300">MASTER</span>
                      ) : (
                        <span className="text-zinc-400">{getAdminRoleLabel(a.role)}</span>
                      )}
                    </td>
                    {ALL_ORGS.map((o) => {
                      const r = a.orgRoles[o];
                      return (
                        <td key={o} className="px-3 py-2 text-xs">
                          {r ? (
                            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-200">{getAdminRoleLabel(r)}</span>
                          ) : a.isMaster ? (
                            <span className="text-zinc-500">—</span>
                          ) : (
                            <span className="text-zinc-600">none</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {audit.length > 0 && (
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Recent role changes</div>
            <ul className="space-y-1 text-xs text-zinc-400">
              {audit.slice(0, 5).map((a) => (
                <li key={a.id}>
                  {new Date(a.createdAt).toLocaleDateString()} — {a.action} {a.targetEmail} by {a.actorEmail}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-zinc-500">Full history available in the People → Directory audit log per org.</p>
          </div>
        )}
      </div>

      {/* Assignment Form */}
      <form onSubmit={submitAssignment} className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-5">
        <h2 className="mb-1 text-lg font-semibold text-emerald-100">Assign / Change Role</h2>
        <p className="mb-4 text-sm text-emerald-200/80">
          Choose the smallest role that gives the person exactly what they need. Prefer per-org ADMIN over global BOARD or MASTER.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">User email (or select below)</span>
            <input
              value={targetEmail}
              onChange={(e) => {
                setTargetEmail(e.target.value);
                setSelectedUserId(null);
              }}
              placeholder="operator@example.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">Quick select from registered users</span>
            <select
              value={selectedUserId || ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedUserId(id);
                const u = registered.find((r) => r.id === id);
                if (u) setTargetEmail(u.email);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Select user —</option>
              {registered.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} {u.name ? `(${u.name})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400">Quick persona suggestions:</span>
            <button type="button" onClick={() => quickSuggestForPersona("operator")} className="rounded border border-emerald-700/50 px-2 py-0.5 hover:bg-emerald-950/30">League Operator</button>
            <button type="button" onClick={() => quickSuggestForPersona("scorekeeper")} className="rounded border border-emerald-700/50 px-2 py-0.5 hover:bg-emerald-950/30">Scorekeeper</button>
            <button type="button" onClick={() => quickSuggestForPersona("board")} className="rounded border border-emerald-700/50 px-2 py-0.5 hover:bg-emerald-950/30">Board / Moderator</button>
            <button type="button" onClick={() => quickSuggestForPersona("platform")} className="rounded border border-emerald-700/50 px-2 py-0.5 hover:bg-emerald-950/30">Platform (Master)</button>
            <button type="button" onClick={applySuggestion} className="ml-2 rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-900">Suggest least privilege</button>
          </div>

          {suggested && (
            <div className="mb-3 rounded border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
              Suggested: <span className="font-semibold">{getAdminRoleLabel(suggested.role)}</span> — {suggested.notes}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {ALL_ORGS.map((org) => (
              <label key={org} className="block text-sm">
                <span className="mb-1 block text-zinc-400">{getOrgDisplayName(org)}</span>
                <select
                  value={orgRoles[org] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value as AdminRole | "";
                    updateOrgRole(org, v);
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">No access</option>
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>{getAdminRoleLabel(r)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || !targetEmail.trim()}
          className="mt-4 rounded-lg border border-emerald-600/60 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/60 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save role assignment(s)"}
        </button>

        <p className="mt-2 text-xs text-zinc-500">
          This uses the same secure endpoints as the People hub. All changes are logged.
        </p>
      </form>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      )}

      <div className="text-xs text-zinc-500">
        Tip: For day-to-day league work give <span className="text-zinc-300">ADMIN</span> on the specific organization(s). Only use BOARD_MEMBER when scores entry or moderation is needed. MASTER_ADMIN is for platform owners only.
      </div>
    </div>
  );
}
