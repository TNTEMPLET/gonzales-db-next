"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";
import {
  FALLBACK_VOLUNTEER_ROLES,
  READINESS_LABELS,
  REQUIREMENT_LABELS,
  VOLUNTEER_REQUIREMENT_STATUSES,
  type VolunteerCardView,
  type VolunteerReadiness,
  type VolunteerRoleDefView,
} from "@/lib/volunteers/types";

type Stats = {
  total: number;
  ready: number;
  incomplete: number;
  expired: number;
  blocked: number;
  missingJdp: number;
  missingAat: number;
};

const READINESS_STYLES: Record<VolunteerReadiness, string> = {
  READY: "border-emerald-700 bg-emerald-950/40 text-emerald-200",
  INCOMPLETE: "border-amber-700 bg-amber-950/30 text-amber-100",
  EXPIRED: "border-orange-700 bg-orange-950/40 text-orange-100",
  BLOCKED: "border-red-700 bg-red-950/40 text-red-200",
};

function displayName(card: VolunteerCardView) {
  const parts = [card.registeredUser.firstName, card.registeredUser.lastName]
    .filter(Boolean)
    .join(" ");
  return parts || card.registeredUser.name || card.registeredUser.email;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function AdminVolunteersManager({
  targetOrg,
  focusUserId,
  isMaster = false,
}: {
  targetOrg: ContentOrgId;
  focusUserId?: string | null;
  isMaster?: boolean;
}) {
  const orgQuery = `org=${targetOrg}`;
  const [cards, setCards] = useState<VolunteerCardView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [seasonYear, setSeasonYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [readiness, setReadiness] = useState("");
  const [missing, setMissing] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roleCatalog, setRoleCatalog] = useState<VolunteerRoleDefView[]>(
    () => FALLBACK_VOLUNTEER_ROLES.map((r) => ({ ...r })),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reqBusy, setReqBusy] = useState(false);

  // Master role catalog CRUD
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roleAdminRows, setRoleAdminRows] = useState<VolunteerRoleDefView[]>([]);
  const [roleEditId, setRoleEditId] = useState<string | null>(null);
  const [roleFormKey, setRoleFormKey] = useState("");
  const [roleFormLabel, setRoleFormLabel] = useState("");
  const [roleFormActive, setRoleFormActive] = useState(true);
  const [roleFormSort, setRoleFormSort] = useState("0");
  const [roleBusy, setRoleBusy] = useState(false);

  const selected = useMemo(
    () => cards.find((c) => c.id === selectedId) || null,
    [cards, selectedId],
  );

  const load = useCallback(async (opts?: { autoSync?: boolean }) => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("org", targetOrg);
      if (search.trim()) params.set("search", search.trim());
      if (readiness) params.set("readiness", readiness);
      if (missing) params.set("missing", missing);
      if (roleFilter) params.set("role", roleFilter);
      if (opts?.autoSync) params.set("autoSync", "1");
      const response = await fetch(`/api/admin/volunteers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        data?: VolunteerCardView[];
        stats?: Stats;
        seasonYear?: number;
        roles?: VolunteerRoleDefView[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to load volunteers");
      const data = Array.isArray(json.data) ? json.data : [];
      setCards(data);
      setStats(json.stats || null);
      setSeasonYear(json.seasonYear ?? null);
      if (Array.isArray(json.roles) && json.roles.length) {
        setRoleCatalog(json.roles);
      }

      if (focusUserId) {
        const match = data.find((c) => c.registeredUser.id === focusUserId);
        if (match) setSelectedId(match.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load volunteers");
    } finally {
      setBusy(false);
    }
  }, [targetOrg, search, readiness, missing, roleFilter, focusUserId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter/org change only
  }, [targetOrg, search, readiness, missing, roleFilter]);

  async function syncCoaches() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/volunteers/sync?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        createdOrUpdated?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Sync failed");
      setNotice(`Synced ${json.createdOrUpdated ?? 0} coach/volunteer profiles.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveRequirement(
    cardId: string,
    key: string,
    payload: Record<string, unknown>,
  ) {
    setReqBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/volunteers/${cardId}/requirements/${key}?${orgQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await response.json()) as {
        data?: VolunteerCardView;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Update failed");
      if (json.data) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? json.data! : c)));
        setNotice(`${REQUIREMENT_LABELS[key as keyof typeof REQUIREMENT_LABELS] || key} updated.`);
      } else {
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setReqBusy(false);
    }
  }

  async function uploadAat(cardId: string, file: File) {
    setReqBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("certificate", file);
      const response = await fetch(
        `/api/admin/volunteers/${cardId}/requirements/ABUSE_AWARENESS?${orgQuery}`,
        { method: "POST", body: form },
      );
      const json = (await response.json()) as {
        data?: VolunteerCardView;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Upload failed");
      if (json.data) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? json.data! : c)));
      }
      setNotice("Abuse Awareness certificate uploaded.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setReqBusy(false);
    }
  }

  async function saveNotes(cardId: string, notes: string) {
    setReqBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/volunteers/${cardId}?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = (await response.json()) as {
        data?: VolunteerCardView;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Save failed");
      if (json.data) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? json.data! : c)));
      }
      setNotice("Notes saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setReqBusy(false);
    }
  }

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("org", targetOrg);
    params.set("format", "csv");
    if (search.trim()) params.set("search", search.trim());
    if (readiness) params.set("readiness", readiness);
    if (missing) params.set("missing", missing);
    if (roleFilter) params.set("role", roleFilter);
    return `/api/admin/volunteers?${params.toString()}`;
  }, [targetOrg, search, readiness, missing, roleFilter]);

  async function loadRoleAdminRows() {
    if (!isMaster) return;
    setRoleBusy(true);
    try {
      const response = await fetch(
        `/api/admin/volunteers/roles?includeInactive=1`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as {
        data?: VolunteerRoleDefView[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to load roles");
      const rows = Array.isArray(json.data) ? json.data : [];
      setRoleAdminRows(rows);
      setRoleCatalog(rows.filter((r) => r.isActive));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setRoleBusy(false);
    }
  }

  function resetRoleForm() {
    setRoleEditId(null);
    setRoleFormKey("");
    setRoleFormLabel("");
    setRoleFormActive(true);
    setRoleFormSort(
      String((roleAdminRows.reduce((m, r) => Math.max(m, r.sortOrder), 0) || 0) + 10),
    );
  }

  function startEditRole(row: VolunteerRoleDefView) {
    setRoleEditId(row.id || null);
    setRoleFormKey(row.key);
    setRoleFormLabel(row.label);
    setRoleFormActive(row.isActive);
    setRoleFormSort(String(row.sortOrder));
  }

  async function saveRole() {
    if (!isMaster) return;
    setRoleBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        key: roleFormKey,
        label: roleFormLabel,
        isActive: roleFormActive,
        sortOrder: Number(roleFormSort) || 0,
      };
      const url = roleEditId
        ? `/api/admin/volunteers/roles/${roleEditId}`
        : `/api/admin/volunteers/roles`;
      const response = await fetch(url, {
        method: roleEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          roleEditId
            ? {
                label: payload.label,
                isActive: payload.isActive,
                sortOrder: payload.sortOrder,
              }
            : payload,
        ),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Save failed");
      setNotice(roleEditId ? "Role updated." : "Role created.");
      resetRoleForm();
      await loadRoleAdminRows();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setRoleBusy(false);
    }
  }

  async function deleteRole(id: string) {
    if (!isMaster) return;
    if (
      !window.confirm(
        "Delete this role? If volunteers still use it, it will be deactivated instead.",
      )
    ) {
      return;
    }
    setRoleBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/volunteers/roles/${id}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Delete failed");
      setNotice("Role removed or deactivated.");
      if (roleEditId === id) resetRoleForm();
      await loadRoleAdminRows();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setRoleBusy(false);
    }
  }

  return (
    <div className="space-y-5">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Volunteers" value={stats?.total ?? "—"} />
        <StatCard label="Ready" value={stats?.ready ?? "—"} tone="emerald" />
        <StatCard label="Missing JDP" value={stats?.missingJdp ?? "—"} tone="amber" />
        <StatCard label="Missing AAT" value={stats?.missingAat ?? "—"} tone="amber" />
      </div>

      {isMaster ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Volunteer roles</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Master Admin only. These options power the role dropdown across all
                leagues. Changes apply immediately — no redeploy.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
              onClick={() => {
                const next = !rolesOpen;
                setRolesOpen(next);
                if (next) {
                  resetRoleForm();
                  void loadRoleAdminRows();
                }
              }}
            >
              {rolesOpen ? "Hide roles" : "Manage roles"}
            </button>
          </div>

          {rolesOpen ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Key</th>
                      <th className="px-3 py-2">Flags</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleAdminRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-zinc-500">
                          {roleBusy ? "Loading…" : "No roles yet."}
                        </td>
                      </tr>
                    ) : (
                      roleAdminRows.map((row) => (
                        <tr key={row.id || row.key} className="border-t border-zinc-800">
                          <td className="px-3 py-2 text-zinc-200">{row.label}</td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                            {row.key}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.isActive ? (
                              <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300">
                                active
                              </span>
                            ) : (
                              <span className="rounded border border-zinc-600 px-1.5 py-0.5 text-zinc-500">
                                inactive
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{row.sortOrder}</td>
                          <td className="px-3 py-2 space-x-2">
                            <button
                              type="button"
                              className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
                              onClick={() => startEditRole(row)}
                              disabled={roleBusy}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/40"
                              onClick={() => row.id && void deleteRole(row.id)}
                              disabled={roleBusy || !row.id}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                <p className="text-sm font-medium">
                  {roleEditId ? "Edit role" : "Add role"}
                </p>
                {!roleEditId ? (
                  <input
                    value={roleFormKey}
                    onChange={(e) => setRoleFormKey(e.target.value)}
                    placeholder="KEY (optional — auto from label)"
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono"
                  />
                ) : (
                  <p className="text-xs font-mono text-zinc-500">Key: {roleFormKey}</p>
                )}
                <input
                  value={roleFormLabel}
                  onChange={(e) => setRoleFormLabel(e.target.value)}
                  placeholder="Display label (e.g. League Head Coach)"
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={roleFormActive}
                      onChange={(e) => setRoleFormActive(e.target.checked)}
                    />
                    Active (shown in dropdowns)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    Sort
                    <input
                      value={roleFormSort}
                      onChange={(e) => setRoleFormSort(e.target.value)}
                      className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={roleBusy || !roleFormLabel.trim()}
                    onClick={() => void saveRole()}
                    className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {roleBusy ? "Saving…" : roleEditId ? "Update" : "Create"}
                  </button>
                  {roleEditId ? (
                    <button
                      type="button"
                      disabled={roleBusy}
                      onClick={() => resetRoleForm()}
                      className="rounded-lg border border-zinc-600 px-4 py-2 text-sm"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {formatOrganizationIdDisplay(targetOrg)}
              {seasonYear ? ` · ${seasonYear}` : ""}
            </p>
            <p className="text-xs text-zinc-500">
              Use Sync coaches to refresh coach profiles. Roles come from the Master catalog.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncCoaches()}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              Sync coaches
            </button>
            <a
              href={exportHref}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              Export CSV
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <select
            value={readiness}
            onChange={(e) => setReadiness(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">All readiness</option>
            {Object.entries(READINESS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={missing}
            onChange={(e) => setMissing(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">Any requirement</option>
            <option value="JDP">Missing JDP</option>
            <option value="ABUSE_AWARENESS">Missing Abuse Awareness</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            {roleCatalog.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Volunteer</th>
                <th className="px-3 py-2">Roles</th>
                <th className="px-3 py-2">JDP</th>
                <th className="px-3 py-2">AAT</th>
                <th className="px-3 py-2">Ready</th>
              </tr>
            </thead>
            <tbody>
              {cards.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    {busy
                      ? "Loading…"
                      : "No volunteers yet. Click Sync coaches or create from Users."}
                  </td>
                </tr>
              ) : (
                cards.map((card) => {
                  const jdp = card.requirements.find((r) => r.key === "JDP");
                  const aat = card.requirements.find((r) => r.key === "ABUSE_AWARENESS");
                  return (
                    <tr
                      key={card.id}
                      className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/80 ${
                        selectedId === card.id ? "bg-zinc-900" : ""
                      }`}
                      onClick={() => setSelectedId(card.id)}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-zinc-100">{displayName(card)}</p>
                        <p className="text-xs text-zinc-500">{card.registeredUser.email}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {card.roles.length
                          ? card.roles.map((r) => r.label || r.roleKey).join(", ")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{statusLabel(jdp?.status || "—")}</td>
                      <td className="px-3 py-2 text-xs">{statusLabel(aat?.status || "—")}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${READINESS_STYLES[card.readiness]}`}
                        >
                          {READINESS_LABELS[card.readiness]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          {!selected ? (
            <p className="text-sm text-zinc-500">
              Select a volunteer to open their card.
            </p>
          ) : (
            <VolunteerCardPanel
              card={selected}
              busy={reqBusy}
              onSaveRequirement={(key, payload) =>
                void saveRequirement(selected.id, key, payload)
              }
              onUploadAat={(file) => void uploadAat(selected.id, file)}
              onSaveNotes={(notes) => void saveNotes(selected.id, notes)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "amber";
}) {
  const border =
    tone === "emerald"
      ? "border-emerald-900/50 bg-emerald-950/20"
      : tone === "amber"
        ? "border-amber-900/50 bg-amber-950/20"
        : "border-zinc-800 bg-zinc-950/50";
  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function VolunteerCardPanel({
  card,
  busy,
  onSaveRequirement,
  onUploadAat,
  onSaveNotes,
}: {
  card: VolunteerCardView;
  busy: boolean;
  onSaveRequirement: (key: string, payload: Record<string, unknown>) => void;
  onUploadAat: (file: File) => void;
  onSaveNotes: (notes: string) => void;
}) {
  const jdp = card.requirements.find((r) => r.key === "JDP");
  const aat = card.requirements.find((r) => r.key === "ABUSE_AWARENESS");
  const [jdpStatus, setJdpStatus] = useState(jdp?.status || "NOT_STARTED");
  const [jdpRef, setJdpRef] = useState(jdp?.externalRef || "");
  const [jdpCompleted, setJdpCompleted] = useState(
    jdp?.completedAt ? jdp.completedAt.slice(0, 10) : "",
  );
  const [jdpExpires, setJdpExpires] = useState(
    jdp?.expiresAt ? jdp.expiresAt.slice(0, 10) : "",
  );
  const [aatStatus, setAatStatus] = useState(aat?.status || "NOT_STARTED");
  const [notes, setNotes] = useState(card.notes || "");

  useEffect(() => {
    setJdpStatus(jdp?.status || "NOT_STARTED");
    setJdpRef(jdp?.externalRef || "");
    setJdpCompleted(jdp?.completedAt ? jdp.completedAt.slice(0, 10) : "");
    setJdpExpires(jdp?.expiresAt ? jdp.expiresAt.slice(0, 10) : "");
    setAatStatus(aat?.status || "NOT_STARTED");
    setNotes(card.notes || "");
  }, [card.id, jdp, aat, card.notes]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{displayName(card)}</h2>
            <p className="text-sm text-zinc-400">{card.registeredUser.email}</p>
            {card.registeredUser.contactPhone ? (
              <p className="text-xs text-zinc-500">{card.registeredUser.contactPhone}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex rounded border px-2 py-1 text-xs font-semibold ${READINESS_STYLES[card.readiness]}`}
          >
            {READINESS_LABELS[card.readiness]}
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Roles:{" "}
          {card.roles.length
            ? card.roles.map((r) => r.label || r.roleKey).join(", ")
            : "—"}
        </p>
        {card.teamAssignments.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            Teams:{" "}
            {card.teamAssignments
              .map((t) => `${t.team.ageGroup} ${t.team.teamName}`)
              .join(", ")}
          </p>
        ) : null}
      </div>

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <h3 className="text-sm font-semibold">JDP Background Check</h3>
        <select
          value={jdpStatus}
          onChange={(e) => setJdpStatus(e.target.value as typeof jdpStatus)}
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          disabled={busy}
        >
          {VOLUNTEER_REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <input
          value={jdpRef}
          onChange={(e) => setJdpRef(e.target.value)}
          placeholder="JDP case / confirmation #"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
          disabled={busy}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            Completed
            <input
              type="date"
              value={jdpCompleted}
              onChange={(e) => setJdpCompleted(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              disabled={busy}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Expires
            <input
              type="date"
              value={jdpExpires}
              onChange={(e) => setJdpExpires(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              disabled={busy}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSaveRequirement("JDP", {
              status: jdpStatus,
              externalRef: jdpRef || null,
              completedAt: jdpCompleted || null,
              expiresAt: jdpExpires || null,
            })
          }
          className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          Save JDP
        </button>
      </section>

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <h3 className="text-sm font-semibold">Abuse Awareness Training</h3>
        <select
          value={aatStatus}
          onChange={(e) => setAatStatus(e.target.value as typeof aatStatus)}
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          disabled={busy}
        >
          {VOLUNTEER_REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        {aat?.documentUrl ? (
          <a
            href={aat.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-sky-300 hover:underline"
          >
            View certificate
            {aat.uploadedAt
              ? ` · ${new Date(aat.uploadedAt).toLocaleDateString()}`
              : ""}
          </a>
        ) : (
          <p className="text-xs text-amber-300">No certificate on file</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSaveRequirement("ABUSE_AWARENESS", { status: aatStatus })}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            Save status
          </button>
          <label className="cursor-pointer rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Upload PDF/image
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadAat(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Admin notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveNotes(notes)}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          Save notes
        </button>
      </section>
    </div>
  );
}
