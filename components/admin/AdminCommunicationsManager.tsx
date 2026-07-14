"use client";

import { useEffect, useMemo, useState } from "react";

import { getClientFromAddressOptions, DEFAULT_COMMUNICATIONS_FROM } from "@/lib/communications/fromAddresses";
import type { ContentOrgId } from "@/lib/siteConfig";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";

type Campaign = {
  id: string;
  organizationId: string | null;
  logicalMode: "AND" | "OR";
  channels: Array<"EMAIL" | "SMS">;
  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "SCHEDULED"
    | "SENDING"
    | "SENT"
    | "FAILED"
    | "CANCELED";
  title: string;
  messageSubject: string | null;
  messageBody: string;
  fromEmail?: string | null;
  sendAt: string | null;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  createdAt: string;
  audienceRules: Array<{
    id: string;
    ruleType:
      | "ALL_USERS"
      | "ORGANIZATION"
      | "ALL_COACHES"
      | "ORGANIZATION_COACHES"
      | "COACHING_INTEREST"
      | "ADMIN_ROLE";
    organizationId: string | null;
    adminRole: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR" | null;
    coachingInterestStatus: "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED" | null;
  }>;
  _count?: {
    recipientSnapshots: number;
    deliveries: number;
  };
};

export default function AdminCommunicationsManager({
  targetOrg,
  isMaster,
}: {
  targetOrg: ContentOrgId;
  isMaster: boolean;
}) {
  const orgQuery = `org=${targetOrg}`;
  const targetOrgLabel = formatOrganizationIdDisplay(targetOrg);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewByCampaign, setPreviewByCampaign] = useState<Record<string, number>>({});

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromOptions, setFromOptions] = useState<string[]>(() => getClientFromAddressOptions());
  const [fromEmail, setFromEmail] = useState(DEFAULT_COMMUNICATIONS_FROM);
  const [defaultFrom, setDefaultFrom] = useState(DEFAULT_COMMUNICATIONS_FROM);
  const [scope, setScope] = useState<"ORG" | "GLOBAL">("ORG");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  type FromAddressAdminRow = {
    id: string;
    fromHeader: string;
    label: string | null;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  };
  const [fromAdminRows, setFromAdminRows] = useState<FromAddressAdminRow[]>([]);
  const [fromSettingsOpen, setFromSettingsOpen] = useState(false);
  const [fromEditId, setFromEditId] = useState<string | null>(null);
  const [fromFormHeader, setFromFormHeader] = useState("");
  const [fromFormLabel, setFromFormLabel] = useState("");
  const [fromFormDefault, setFromFormDefault] = useState(false);
  const [fromFormActive, setFromFormActive] = useState(true);
  const [fromFormSort, setFromFormSort] = useState("0");
  const [fromSettingsBusy, setFromSettingsBusy] = useState(false);

  const [ruleAllUsers, setRuleAllUsers] = useState(true);
  const [ruleOrgUsers, setRuleOrgUsers] = useState(false);
  const [ruleAllCoaches, setRuleAllCoaches] = useState(false);
  const [ruleOrgCoaches, setRuleOrgCoaches] = useState(false);
  const [ruleCoachingInterest, setRuleCoachingInterest] = useState(false);
  const [coachingInterestStatus, setCoachingInterestStatus] = useState<
    "" | "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED"
  >("");
  const [roleRule, setRoleRule] = useState<"" | "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR">("");
  const [scheduleAtById, setScheduleAtById] = useState<Record<string, string>>({});
  const coachingInterestEnabled = isCoachingInterestEnabled(targetOrg);

  const campaignStats = useMemo(() => {
    const byStatus = campaigns.reduce<Record<Campaign["status"], number>>(
      (acc, campaign) => {
        acc[campaign.status] += 1;
        return acc;
      },
      {
        DRAFT: 0,
        PENDING_APPROVAL: 0,
        APPROVED: 0,
        REJECTED: 0,
        SCHEDULED: 0,
        SENDING: 0,
        SENT: 0,
        FAILED: 0,
        CANCELED: 0,
      },
    );

    return {
      drafts: byStatus.DRAFT,
      pendingApproval: byStatus.PENDING_APPROVAL,
      scheduled: byStatus.SCHEDULED,
      sent: byStatus.SENT,
      total: campaigns.length,
    };
  }, [campaigns]);

  const canCreate = title.trim().length > 0 && body.trim().length > 0;

  async function loadCampaigns() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/communications/campaigns?${orgQuery}&includeGlobal=1`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        data?: Campaign[];
        error?: string;
        fromOptions?: string[];
        defaultFrom?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to load campaigns");
      setCampaigns(Array.isArray(json.data) ? json.data : []);
      if (Array.isArray(json.fromOptions) && json.fromOptions.length > 0) {
        setFromOptions(json.fromOptions);
      }
      if (json.defaultFrom?.trim()) {
        setDefaultFrom(json.defaultFrom);
        setFromEmail((prev) => {
          if (!prev || prev === DEFAULT_COMMUNICATIONS_FROM || prev === defaultFrom) {
            return json.defaultFrom!;
          }
          return prev;
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setBusy(false);
    }
  }

  async function loadFromAddressSettings() {
    if (!isMaster) return;
    setFromSettingsBusy(true);
    try {
      const response = await fetch(
        `/api/admin/communications/from-addresses?${orgQuery}&includeInactive=1`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as {
        data?: FromAddressAdminRow[];
        defaultFrom?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to load From addresses");
      setFromAdminRows(Array.isArray(json.data) ? json.data : []);
      if (json.defaultFrom) setDefaultFrom(json.defaultFrom);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load From addresses");
    } finally {
      setFromSettingsBusy(false);
    }
  }

  function resetFromForm() {
    setFromEditId(null);
    setFromFormHeader("");
    setFromFormLabel("");
    setFromFormDefault(false);
    setFromFormActive(true);
    setFromFormSort(String((fromAdminRows.reduce((m, r) => Math.max(m, r.sortOrder), 0) || 0) + 10));
  }

  function startEditFrom(row: FromAddressAdminRow) {
    setFromEditId(row.id);
    setFromFormHeader(row.fromHeader);
    setFromFormLabel(row.label || "");
    setFromFormDefault(row.isDefault);
    setFromFormActive(row.isActive);
    setFromFormSort(String(row.sortOrder));
  }

  async function saveFromAddress() {
    if (!isMaster) return;
    setFromSettingsBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        fromHeader: fromFormHeader,
        label: fromFormLabel.trim() || null,
        isDefault: fromFormDefault,
        isActive: fromFormActive,
        sortOrder: Number(fromFormSort) || 0,
      };
      const url = fromEditId
        ? `/api/admin/communications/from-addresses/${fromEditId}?${orgQuery}`
        : `/api/admin/communications/from-addresses?${orgQuery}`;
      const response = await fetch(url, {
        method: fromEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Save failed");
      setNotice(fromEditId ? "From address updated." : "From address created.");
      resetFromForm();
      await loadFromAddressSettings();
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save From address");
    } finally {
      setFromSettingsBusy(false);
    }
  }

  async function deleteFromAddress(id: string) {
    if (!isMaster) return;
    if (!window.confirm("Delete this From address? Campaigns already sent are not affected.")) return;
    setFromSettingsBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/communications/from-addresses/${id}?${orgQuery}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Delete failed");
      setNotice("From address deleted.");
      if (fromEditId === id) resetFromForm();
      await loadFromAddressSettings();
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete From address");
    } finally {
      setFromSettingsBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCampaigns();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  const rulePayload = useMemo(() => {
    const rules: Array<{
      ruleType:
        | "ALL_USERS"
        | "ORGANIZATION"
        | "ALL_COACHES"
        | "ORGANIZATION_COACHES"
        | "COACHING_INTEREST"
        | "ADMIN_ROLE";
      organizationId?: string;
      adminRole?: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR";
      coachingInterestStatus?: "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED" | null;
    }> = [];
    if (ruleAllUsers) rules.push({ ruleType: "ALL_USERS" });
    if (ruleOrgUsers) rules.push({ ruleType: "ORGANIZATION", organizationId: targetOrg });
    if (ruleAllCoaches) rules.push({ ruleType: "ALL_COACHES" });
    if (ruleOrgCoaches) rules.push({ ruleType: "ORGANIZATION_COACHES", organizationId: targetOrg });
    if (coachingInterestEnabled && ruleCoachingInterest) {
      rules.push({
        ruleType: "COACHING_INTEREST",
        organizationId: targetOrg,
        coachingInterestStatus: coachingInterestStatus || null,
      });
    }
    if (roleRule) rules.push({ ruleType: "ADMIN_ROLE", adminRole: roleRule, organizationId: targetOrg });
    return rules;
  }, [
    coachingInterestStatus,
    coachingInterestEnabled,
    roleRule,
    ruleAllCoaches,
    ruleAllUsers,
    ruleCoachingInterest,
    ruleOrgCoaches,
    ruleOrgUsers,
    targetOrg,
  ]);

  async function createCampaign() {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/communications/campaigns?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          messageSubject: subject || null,
          messageBody: body,
          fromEmail,
          channels: ["EMAIL"],
          organizationId: scope === "GLOBAL" ? null : targetOrg,
          quietHoursStart: quietStart ? Number(quietStart) : null,
          quietHoursEnd: quietEnd ? Number(quietEnd) : null,
          rules: rulePayload,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to create campaign");
      setNotice("Campaign draft created.");
      setTitle("");
      setSubject("");
      setBody("");
      setFromEmail(defaultFrom || fromOptions[0] || DEFAULT_COMMUNICATIONS_FROM);
      setRuleCoachingInterest(false);
      setCoachingInterestStatus("");
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, endpoint: string, method: "POST" = "POST", payload?: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/communications/campaigns/${id}/${endpoint}?${orgQuery}`, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const json = (await response.json()) as { error?: string; total?: number; result?: { sent: number; failed: number } };
      if (!response.ok) throw new Error(json.error || `Failed to ${endpoint}`);
      if (endpoint === "preview") {
        setPreviewByCampaign((prev) => ({ ...prev, [id]: json.total ?? 0 }));
        setNotice(`Audience preview: ${json.total ?? 0} recipients.`);
      } else if (endpoint === "send-now") {
        setNotice(`Send complete. Sent ${(json.result?.sent ?? 0)}; failed ${(json.result?.failed ?? 0)}.`);
      } else {
        setNotice("Campaign updated.");
      }
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed action: ${endpoint}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Communication workflow for {targetOrgLabel}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Build the audience first, preview how many people will receive it,
            submit for approval, then schedule or send. Global messages should be
            used only when families across AP Baseball need the same update.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total</p>
            <p className="mt-1 text-2xl font-semibold">{campaignStats.total}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Drafts</p>
            <p className="mt-1 text-2xl font-semibold">{campaignStats.drafts}</p>
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Needs approval</p>
            <p className="mt-1 text-2xl font-semibold text-amber-100">{campaignStats.pendingApproval}</p>
          </div>
          <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-blue-300/80">Scheduled</p>
            <p className="mt-1 text-2xl font-semibold text-blue-100">{campaignStats.scheduled}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Sent</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-100">{campaignStats.sent}</p>
          </div>
        </div>
      </div>
      {error ? <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div> : null}

      {isMaster ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">From address settings</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Master Admin only. Add, edit, or remove senders stored in the database.
                Changes apply immediately on the next campaign create — no deploy.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
              onClick={() => {
                const next = !fromSettingsOpen;
                setFromSettingsOpen(next);
                if (next) {
                  resetFromForm();
                  void loadFromAddressSettings();
                }
              }}
            >
              {fromSettingsOpen ? "Hide settings" : "Manage From addresses"}
            </button>
          </div>

          {fromSettingsOpen ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/80 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Flags</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fromAdminRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-zinc-500">
                          {fromSettingsBusy ? "Loading…" : "No rows yet."}
                        </td>
                      </tr>
                    ) : (
                      fromAdminRows.map((row) => (
                        <tr key={row.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2 font-mono text-xs text-zinc-200">{row.fromHeader}</td>
                          <td className="px-3 py-2 text-zinc-400">{row.label || "—"}</td>
                          <td className="px-3 py-2 text-xs">
                            {row.isDefault ? (
                              <span className="mr-1 rounded border border-emerald-700 px-1.5 py-0.5 text-emerald-300">
                                default
                              </span>
                            ) : null}
                            {!row.isActive ? (
                              <span className="rounded border border-zinc-600 px-1.5 py-0.5 text-zinc-400">
                                inactive
                              </span>
                            ) : (
                              <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-300">
                                active
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{row.sortOrder}</td>
                          <td className="px-3 py-2 space-x-2">
                            <button
                              type="button"
                              className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
                              onClick={() => startEditFrom(row)}
                              disabled={fromSettingsBusy}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/40"
                              onClick={() => void deleteFromAddress(row.id)}
                              disabled={fromSettingsBusy}
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
                  {fromEditId ? "Edit From address" : "Add From address"}
                </p>
                <input
                  value={fromFormHeader}
                  onChange={(e) => setFromFormHeader(e.target.value)}
                  placeholder='AP Baseball <noreply@apbaseball.com>'
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono"
                />
                <input
                  value={fromFormLabel}
                  onChange={(e) => setFromFormLabel(e.target.value)}
                  placeholder="Short label (optional)"
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fromFormDefault}
                      onChange={(e) => setFromFormDefault(e.target.checked)}
                    />
                    Default sender
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fromFormActive}
                      onChange={(e) => setFromFormActive(e.target.checked)}
                    />
                    Active (shown in campaign dropdown)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    Sort
                    <input
                      value={fromFormSort}
                      onChange={(e) => setFromFormSort(e.target.value)}
                      className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={fromSettingsBusy || !fromFormHeader.trim()}
                    onClick={() => void saveFromAddress()}
                    className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {fromSettingsBusy ? "Saving…" : fromEditId ? "Update" : "Create"}
                  </button>
                  {fromEditId ? (
                    <button
                      type="button"
                      disabled={fromSettingsBusy}
                      onClick={() => resetFromForm()}
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Create campaign</h2>
        <p className="text-sm text-zinc-400">
          Start as a draft. Non-master admins must get Board Member+ approval before
          send. Master Admin can Preview then Send now without a second approver.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Campaign title"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject (optional)"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <div>
          <label className="text-xs text-zinc-500">From address</label>
          <select
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            {fromOptions.map((option) => (
              <option key={option} value={option}>
                {option}
                {option === defaultFrom ? " (default)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Recipients see this sender. Master Admins manage the list under From address settings
            (no redeploy required). Domain must stay verified in Resend.
          </p>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Message body"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-zinc-500">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "ORG" | "GLOBAL")}
              className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
              disabled={!isMaster}
            >
              <option value="ORG">Organization only ({targetOrgLabel})</option>
              <option value="GLOBAL">Global (all orgs)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">Quiet start (hour 0-23)</label>
            <input
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
              placeholder="e.g. 22"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Quiet end (hour 0-23)</label>
            <input
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
              placeholder="e.g. 7"
            />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
          <p className="text-sm font-medium">Audience rules</p>
          <p className="text-xs text-zinc-500">
            Audience choices are combined together: recipients must match every
            option you enable. Select fewer boxes for a broader audience and more
            boxes for a narrower list.
          </p>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleAllUsers} onChange={(e) => setRuleAllUsers(e.target.checked)} />All users</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleOrgUsers} onChange={(e) => setRuleOrgUsers(e.target.checked)} />Users in {targetOrgLabel}</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleAllCoaches} onChange={(e) => setRuleAllCoaches(e.target.checked)} />All coaches</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ruleOrgCoaches} onChange={(e) => setRuleOrgCoaches(e.target.checked)} />Coaches in {targetOrgLabel}</label>
            {coachingInterestEnabled ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ruleCoachingInterest}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRuleCoachingInterest(checked);
                    if (checked) {
                      setRuleAllUsers(false);
                      setRuleOrgUsers(false);
                      setRuleAllCoaches(false);
                      setRuleOrgCoaches(false);
                      setRoleRule("");
                    }
                  }}
                />
                Coaching Interest
              </label>
            ) : null}
          </div>
          {coachingInterestEnabled && ruleCoachingInterest ? (
            <div>
              <label className="text-xs text-zinc-500">Coaching interest status</label>
              <select
                value={coachingInterestStatus}
                onChange={(e) => setCoachingInterestStatus(e.target.value as typeof coachingInterestStatus)}
                className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
              >
                <option value="">New + Contacted</option>
                <option value="NEW">New only</option>
                <option value="CONTACTED">Contacted only</option>
                <option value="NOT_INTERESTED">Not interested</option>
                <option value="CONVERTED">Converted</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          ) : null}
          <div>
            <label className="text-xs text-zinc-500">Include admin role (optional)</label>
            <select
              value={roleRule}
              onChange={(e) => setRoleRule(e.target.value as "" | "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR")}
              className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-2 text-sm"
            >
              <option value="">No role filter</option>
              <option value="PARK_DIRECTOR">Park Director+</option>
              <option value="BOARD_MEMBER">Board Member+</option>
              <option value="ADMIN">Admin+</option>
              <option value="MASTER_ADMIN">Master Admin only</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !canCreate}
          onClick={() => void createCampaign()}
          className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Working..." : "Create draft"}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <p className="text-sm text-zinc-400">
          Use Preview to confirm the recipient count before send. Master Admin can
          Send now from Draft; other admins need approval first.
        </p>
        {campaigns.length === 0 ? (
          <p className="text-sm text-zinc-500">No campaigns yet.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const canSendNow =
                campaign.status === "APPROVED" ||
                campaign.status === "SCHEDULED" ||
                (isMaster &&
                  (campaign.status === "DRAFT" || campaign.status === "PENDING_APPROVAL"));
              const previewCount = previewByCampaign[campaign.id];
              return (
              <div key={campaign.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{campaign.title}</p>
                  <span className="text-xs rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-300">
                    {campaign.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Scope: {formatOrganizationIdDisplay(campaign.organizationId)} · From:{" "}
                  {campaign.fromEmail || defaultFrom} · Audience: all rules (AND) · Channels:{" "}
                  {campaign.channels.join(", ")}
                </p>
                <p className="text-xs text-zinc-500">
                  Snapshots: {campaign._count?.recipientSnapshots ?? 0} · Deliveries: {campaign._count?.deliveries ?? 0}
                  {previewCount != null ? ` · Preview: ${previewCount}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded border border-zinc-700 px-2 py-1 text-xs" onClick={() => void action(campaign.id, "preview")}>Preview</button>
                  <button className="rounded border border-zinc-700 px-2 py-1 text-xs" onClick={() => void action(campaign.id, "submit-approval")} disabled={busy || campaign.status !== "DRAFT" && campaign.status !== "REJECTED"}>Submit approval</button>
                  <button className="rounded border border-zinc-700 px-2 py-1 text-xs" onClick={() => void action(campaign.id, "approve")} disabled={busy || campaign.status !== "PENDING_APPROVAL"}>Approve</button>
                  <button className="rounded border border-zinc-700 px-2 py-1 text-xs" onClick={() => void action(campaign.id, "reject", "POST", { note: "Rejected from manager UI" })} disabled={busy || campaign.status !== "PENDING_APPROVAL"}>Reject</button>
                  <button
                    className="rounded border border-emerald-700 text-emerald-200 px-2 py-1 text-xs disabled:opacity-50"
                    onClick={() => {
                      const count =
                        previewCount ??
                        campaign._count?.recipientSnapshots ??
                        0;
                      const subject = campaign.messageSubject || campaign.title;
                      const ok = window.confirm(
                        `Send "${subject}" now to ~${count || "all matching"} recipient(s)?\n\nThis cannot be undone.`,
                      );
                      if (ok) void action(campaign.id, "send-now");
                    }}
                    disabled={busy || !canSendNow}
                  >
                    Send now{isMaster && (campaign.status === "DRAFT" || campaign.status === "PENDING_APPROVAL") ? " (Master)" : ""}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="datetime-local"
                    value={scheduleAtById[campaign.id] || ""}
                    onChange={(e) => setScheduleAtById((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                    className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs"
                  />
                  <button
                    className="rounded border border-zinc-700 px-2 py-1 text-xs"
                    disabled={busy || !scheduleAtById[campaign.id]}
                    onClick={() =>
                      void action(campaign.id, "schedule", "POST", {
                        sendAt: new Date(scheduleAtById[campaign.id]).toISOString(),
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      })
                    }
                  >
                    Schedule
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
