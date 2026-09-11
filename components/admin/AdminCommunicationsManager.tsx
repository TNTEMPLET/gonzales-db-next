"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildDivisionAudienceRules,
  formatAudienceSummary,
  summarizeDivisionAudience,
} from "@/lib/communications/divisionAudience";
import {
  DEFAULT_COMMUNICATIONS_FROM,
  getClientFromAddressOptions,
} from "@/lib/communications/fromAddressConstants";
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
      | "ADMIN_ROLE"
      | "EXPLICIT_USERS"
      | "EXPLICIT_CONTACTS"
      | "DIVISION_COACHES"
      | "DIVISION_PARENTS";
    organizationId: string | null;
    adminRole: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR" | null;
    coachingInterestStatus: "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED" | null;
    ageGroups?: string[];
    seasonYear?: number | null;
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
  const [previewByCampaign, setPreviewByCampaign] = useState<
    Record<string, { total: number; sample: PreviewSample[] }>
  >({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  type PreviewSample = {
    email: string | null;
    contactName: string | null;
    matchReasons: string[];
    recipientType: string;
    isCoach: boolean;
  };
  type AudienceDivisionOption = {
    ageGroup: string;
    coachCount: number;
    parentCount: number;
  };
  const [audienceDivisions, setAudienceDivisions] = useState<AudienceDivisionOption[]>([]);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [seasonLabel, setSeasonLabel] = useState("");
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [includeCoaches, setIncludeCoaches] = useState(true);
  const [includeParents, setIncludeParents] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const [ruleAllUsers, setRuleAllUsers] = useState(false);
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

  const divisionAudienceReady =
    selectedDivisions.length > 0 && (includeCoaches || includeParents);
  const advancedAudienceReady =
    ruleAllUsers || ruleOrgUsers || ruleAllCoaches || ruleOrgCoaches || ruleCoachingInterest || Boolean(roleRule);
  const canCreate =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (divisionAudienceReady || (selectedDivisions.length === 0 && advancedAudienceReady));

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

  async function loadAudienceOptions() {
    try {
      const response = await fetch(`/api/admin/communications/audience-options?${orgQuery}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        seasonYear?: number;
        seasonLabel?: string;
        divisions?: AudienceDivisionOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to load audience options");
      if (typeof json.seasonYear === "number") setSeasonYear(json.seasonYear);
      if (json.seasonLabel) setSeasonLabel(json.seasonLabel);
      setAudienceDivisions(Array.isArray(json.divisions) ? json.divisions : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load audience options");
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
      void loadAudienceOptions();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  const rulePayload = useMemo(() => {
    const divisionRules = buildDivisionAudienceRules({
      organizationId: targetOrg,
      seasonYear,
      ageGroups: selectedDivisions,
      includeCoaches,
      includeParents,
    });
    if (divisionRules.length > 0) return divisionRules;

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
    includeCoaches,
    includeParents,
    roleRule,
    ruleAllCoaches,
    ruleAllUsers,
    ruleCoachingInterest,
    ruleOrgCoaches,
    ruleOrgUsers,
    seasonYear,
    selectedDivisions,
    targetOrg,
  ]);

  function resetComposer() {
    setEditingId(null);
    setTitle("");
    setSubject("");
    setBody("");
    setFromEmail(defaultFrom || fromOptions[0] || DEFAULT_COMMUNICATIONS_FROM);
    setScope("ORG");
    setQuietStart("");
    setQuietEnd("");
    setSelectedDivisions([]);
    setIncludeCoaches(true);
    setIncludeParents(true);
    setRuleAllUsers(false);
    setRuleOrgUsers(false);
    setRuleAllCoaches(false);
    setRuleOrgCoaches(false);
    setRuleCoachingInterest(false);
    setCoachingInterestStatus("");
    setRoleRule("");
    setAdvancedOpen(false);
  }

  function startEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setReviewingId(null);
    setTitle(campaign.title);
    setSubject(campaign.messageSubject || "");
    setBody(campaign.messageBody);
    setFromEmail(campaign.fromEmail || defaultFrom);
    setScope(campaign.organizationId ? "ORG" : "GLOBAL");
    setQuietStart(campaign.quietHoursStart != null ? String(campaign.quietHoursStart) : "");
    setQuietEnd(campaign.quietHoursEnd != null ? String(campaign.quietHoursEnd) : "");
    const division = summarizeDivisionAudience(campaign.audienceRules);
    if (division) {
      setSelectedDivisions(division.ageGroups);
      setIncludeCoaches(division.includeCoaches);
      setIncludeParents(division.includeParents);
      if (division.seasonYear) setSeasonYear(division.seasonYear);
      setAdvancedOpen(false);
    } else {
      setSelectedDivisions([]);
      setIncludeCoaches(true);
      setIncludeParents(true);
      setAdvancedOpen(true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCampaign() {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        title,
        messageSubject: subject || null,
        messageBody: body,
        fromEmail,
        channels: ["EMAIL"] as const,
        organizationId: scope === "GLOBAL" && selectedDivisions.length === 0 ? null : targetOrg,
        quietHoursStart: quietStart ? Number(quietStart) : null,
        quietHoursEnd: quietEnd ? Number(quietEnd) : null,
        rules: rulePayload,
      };
      const url = editingId
        ? `/api/admin/communications/campaigns/${editingId}?${orgQuery}`
        : `/api/admin/communications/campaigns?${orgQuery}`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { error?: string; data?: { id: string } };
      if (!response.ok) throw new Error(json.error || "Failed to save campaign");
      const savedId = json.data?.id || editingId;
      setNotice(editingId ? "Draft updated. Review it before send." : "Campaign draft created. Review it before send.");
      resetComposer();
      await loadCampaigns();
      if (savedId) await openReview(savedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign, label: string) {
    const ok = window.confirm(
      `${label} "${campaign.title}"?\n\nThis removes the campaign. It will not be sent.`,
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/communications/campaigns/${campaign.id}?${orgQuery}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to delete campaign");
      setNotice("Campaign deleted.");
      if (reviewingId === campaign.id) setReviewingId(null);
      if (editingId === campaign.id) resetComposer();
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setBusy(false);
    }
  }

  async function openReview(id: string) {
    setReviewingId(id);
    setBusy(true);
    setError("");
    try {
      const [detailRes, previewRes] = await Promise.all([
        fetch(`/api/admin/communications/campaigns/${id}?${orgQuery}`, { cache: "no-store" }),
        fetch(`/api/admin/communications/campaigns/${id}/preview?${orgQuery}`, { method: "POST" }),
      ]);
      const detailJson = (await detailRes.json()) as { data?: Campaign; error?: string };
      const previewJson = (await previewRes.json()) as {
        total?: number;
        sample?: PreviewSample[];
        error?: string;
      };
      if (!detailRes.ok) throw new Error(detailJson.error || "Failed to load campaign");
      if (!previewRes.ok) throw new Error(previewJson.error || "Failed to preview audience");
      if (detailJson.data) {
        setCampaigns((prev) => prev.map((row) => (row.id === id ? { ...row, ...detailJson.data } : row)));
      }
      setPreviewByCampaign((prev) => ({
        ...prev,
        [id]: {
          total: previewJson.total ?? 0,
          sample: Array.isArray(previewJson.sample) ? previewJson.sample : [],
        },
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to review campaign");
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
        const previewJson = json as { total?: number; sample?: PreviewSample[] };
        setPreviewByCampaign((prev) => ({
          ...prev,
          [id]: {
            total: previewJson.total ?? 0,
            sample: Array.isArray(previewJson.sample) ? previewJson.sample : [],
          },
        }));
        setNotice(`Audience preview: ${previewJson.total ?? 0} recipients.`);
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
            Pick divisions and Coaches and/or Parents, save a draft, then Review
            the full message before approve, send, or delete. Global messages
            should be used only when families across AP Baseball need the same
            update.
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
        <h2 className="text-lg font-semibold">{editingId ? "Update draft" : "Create campaign"}</h2>
        <p className="text-sm text-zinc-400">
          Creates a draft. Open Review to read the message and audience before
          approve, send, or delete. Master Admin does not need a second approver,
          but must review first.
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
              disabled={!isMaster || selectedDivisions.length > 0}
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

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Who gets this email</p>
              <p className="text-xs text-zinc-500">
                {seasonLabel || `Season ${seasonYear}`}. Pick one or more divisions, then
                Coaches and/or Parents. Combined as a union — one email per address.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-zinc-700 px-2 py-1 text-xs"
                onClick={() => setSelectedDivisions(audienceDivisions.map((row) => row.ageGroup))}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded border border-zinc-700 px-2 py-1 text-xs"
                onClick={() => setSelectedDivisions([])}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm max-h-64 overflow-y-auto pr-1">
            {audienceDivisions.length === 0 ? (
              <p className="text-xs text-zinc-500 col-span-full">Loading divisions…</p>
            ) : (
              audienceDivisions.map((row) => {
                const checked = selectedDivisions.includes(row.ageGroup);
                return (
                  <label
                    key={row.ageGroup}
                    className={`inline-flex items-start gap-2 rounded-lg border px-2 py-1.5 ${
                      checked ? "border-brand-purple bg-brand-purple/10" : "border-zinc-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSelectedDivisions((prev) =>
                          on ? [...prev, row.ageGroup] : prev.filter((value) => value !== row.ageGroup),
                        );
                      }}
                    />
                    <span>
                      <span className="font-medium">{row.ageGroup}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {row.coachCount} coaches · {row.parentCount} parents
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeCoaches}
                onChange={(e) => setIncludeCoaches(e.target.checked)}
              />
              Coaches
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeParents}
                onChange={(e) => setIncludeParents(e.target.checked)}
              />
              Parents
            </label>
          </div>
          {!divisionAudienceReady ? (
            <p className="text-xs text-amber-300/90">Pick at least one division and Coaches and/or Parents.</p>
          ) : null}

          <button
            type="button"
            className="text-xs text-zinc-400 underline"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            {advancedOpen ? "Hide advanced audience" : "Advanced audience"}
          </button>
          {advancedOpen ? (
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <p className="text-xs text-zinc-500">
                Used only when no divisions are selected. Recipients must match every option.
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
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canCreate}
            onClick={() => void saveCampaign()}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Working..." : editingId ? "Update draft" : "Create draft"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => resetComposer()}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <p className="text-sm text-zinc-400">
          Review the full message before approve or send. Reject &amp; delete
          removes a pending campaign so it cannot go out.
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
              const preview = previewByCampaign[campaign.id];
              const isReviewing = reviewingId === campaign.id;
              const canEdit = campaign.status === "DRAFT" || campaign.status === "REJECTED";
              const canDeleteRow =
                campaign.status === "DRAFT" ||
                campaign.status === "REJECTED" ||
                campaign.status === "PENDING_APPROVAL" ||
                campaign.status === "CANCELED";
              const audienceLabel = formatAudienceSummary(campaign.audienceRules);
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
                  {campaign.fromEmail || defaultFrom} · {audienceLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border border-zinc-700 px-2 py-1 text-xs"
                    onClick={() => {
                      if (isReviewing) setReviewingId(null);
                      else void openReview(campaign.id);
                    }}
                  >
                    {isReviewing ? "Close review" : "Review"}
                  </button>
                  {canEdit ? (
                    <button
                      className="rounded border border-zinc-700 px-2 py-1 text-xs"
                      onClick={() => startEdit(campaign)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                  ) : null}
                  {campaign.status === "PENDING_APPROVAL" ? (
                    <button
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300"
                      onClick={() => void deleteCampaign(campaign, "Reject and delete")}
                      disabled={busy}
                    >
                      Reject &amp; delete
                    </button>
                  ) : null}
                  {canDeleteRow && campaign.status !== "PENDING_APPROVAL" ? (
                    <button
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300"
                      onClick={() => void deleteCampaign(campaign, "Delete")}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  ) : null}
                  {campaign.status === "SCHEDULED" ? (
                    <button
                      className="rounded border border-zinc-700 px-2 py-1 text-xs"
                      onClick={() => void action(campaign.id, "cancel")}
                      disabled={busy}
                    >
                      Cancel schedule
                    </button>
                  ) : null}
                </div>
                {isReviewing ? (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 space-y-3">
                    <div className="grid gap-2 text-sm">
                      <p>
                        <span className="text-zinc-500">Subject: </span>
                        {campaign.messageSubject || campaign.title}
                      </p>
                      <p className="text-xs text-zinc-500">
                        From {campaign.fromEmail || defaultFrom} · {audienceLabel}
                        {preview ? ` · ${preview.total} recipients` : busy ? " · Loading audience…" : ""}
                      </p>
                      <div className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200 max-h-80 overflow-y-auto">
                        {campaign.messageBody}
                      </div>
                    </div>
                    {preview && preview.sample.length > 0 ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                          Sample recipients
                        </p>
                        <ul className="text-xs text-zinc-400 space-y-0.5 max-h-40 overflow-y-auto">
                          {preview.sample.slice(0, 25).map((row, index) => (
                            <li key={`${row.email || "none"}-${index}`}>
                              {row.email || "(no email)"}
                              {row.contactName ? ` · ${row.contactName}` : ""}
                              {row.isCoach ? " · coach" : ""}
                            </li>
                          ))}
                          {preview.total > 25 ? (
                            <li className="text-zinc-500">…and {preview.total - 25} more</li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {campaign.status === "DRAFT" || campaign.status === "REJECTED" ? (
                        <button
                          className="rounded border border-zinc-700 px-2 py-1 text-xs"
                          onClick={() => void action(campaign.id, "submit-approval")}
                          disabled={busy}
                        >
                          Submit approval
                        </button>
                      ) : null}
                      {campaign.status === "PENDING_APPROVAL" ? (
                        <button
                          className="rounded border border-zinc-700 px-2 py-1 text-xs"
                          onClick={() => void action(campaign.id, "approve")}
                          disabled={busy}
                        >
                          Approve
                        </button>
                      ) : null}
                      {canSendNow ? (
                        <button
                          className="rounded border border-emerald-700 text-emerald-200 px-2 py-1 text-xs disabled:opacity-50"
                          onClick={() => {
                            const count = preview?.total ?? 0;
                            const subjectLine = campaign.messageSubject || campaign.title;
                            const snippet = campaign.messageBody.trim().slice(0, 200);
                            const ok = window.confirm(
                              `Send "${subjectLine}" now to ${count} recipient(s)?\n\n${audienceLabel}\n\n${snippet}${campaign.messageBody.trim().length > 200 ? "…" : ""}\n\nThis cannot be undone.`,
                            );
                            if (ok) void action(campaign.id, "send-now");
                          }}
                          disabled={busy || preview == null}
                        >
                          Send now{isMaster && (campaign.status === "DRAFT" || campaign.status === "PENDING_APPROVAL") ? " (Master)" : ""}
                        </button>
                      ) : null}
                    </div>
                    {canSendNow ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="datetime-local"
                          value={scheduleAtById[campaign.id] || ""}
                          onChange={(e) => setScheduleAtById((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                          className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs"
                        />
                        <button
                          className="rounded border border-zinc-700 px-2 py-1 text-xs"
                          disabled={busy || !scheduleAtById[campaign.id] || preview == null}
                          onClick={() => {
                            const when = scheduleAtById[campaign.id];
                            const subjectLine = campaign.messageSubject || campaign.title;
                            const ok = window.confirm(
                              `Schedule "${subjectLine}" for ${when}?\n\n${audienceLabel}\n\n${preview?.total ?? 0} recipient(s).`,
                            );
                            if (!ok) return;
                            void action(campaign.id, "schedule", "POST", {
                              sendAt: new Date(when).toISOString(),
                              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            });
                          }}
                        >
                          Schedule
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
