"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [scope, setScope] = useState<"ORG" | "GLOBAL">("ORG");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

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
      const json = (await response.json()) as { data?: Campaign[]; error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to load campaigns");
      setCampaigns(Array.isArray(json.data) ? json.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setBusy(false);
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
                  Scope: {formatOrganizationIdDisplay(campaign.organizationId)} · Audience: all rules (AND) · Channels: {campaign.channels.join(", ")}
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
