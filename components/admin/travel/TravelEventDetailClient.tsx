"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FieldDef = {
  key: string;
  label: string;
  sheetColumn: string;
  sortOrder: number;
};

type LastDelivery = {
  status: string;
  toEmail: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  attemptedAt: string | null;
  provider: string | null;
};

type EmailStatus =
  | "sent"
  | "failed"
  | "no_email"
  | "not_sent"
  | "suppressed";

type Participant = {
  id: string;
  playerFullName: string;
  ageGroup: string | null;
  team: string | null;
  jerseyNumber: string | null;
  status: string;
  inviteToken: string;
  inviteUrl: string;
  submitterName: string | null;
  submitterEmail: string | null;
  guardianEmail?: string | null;
  inviteEmailSentAt?: string | null;
  inviteEmailTo?: string | null;
  inviteEmailCount?: number;
  emailStatus?: EmailStatus;
  lastDelivery?: LastDelivery | null;
  submittedAt: string | null;
  answers: Record<string, unknown>;
};

type EmailSummary = {
  total: number;
  withEmail: number;
  noEmail: number;
  sent: number;
  notSent: number;
  failed: number;
  suppressed: number;
};

type EventDetail = {
  id: string;
  name: string;
  teamLabel: string | null;
  status: string;
  googleSheetUrl: string | null;
  introMarkdown: string | null;
  organizationId: string;
  fields: FieldDef[];
};

type RosterCycleOption = {
  id: string;
  label: string;
  seasonYear: number;
  ageGroup: string;
  selectedCount: number;
  secondTeamCount: number;
};

export default function TravelEventDetailClient({
  eventId,
  organizationId,
}: {
  eventId: string;
  organizationId: string;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [namesText, setNamesText] = useState("");
  const [adding, setAdding] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rosterCycles, setRosterCycles] = useState<RosterCycleOption[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [rosterTeam, setRosterTeam] = useState<"first" | "second" | "both">(
    "both",
  );
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailing, setEmailing] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [resendAlready, setResendAlready] = useState(false);
  const [emailSummary, setEmailSummary] = useState<EmailSummary | null>(null);
  const [emailFilter, setEmailFilter] = useState<
    "all" | EmailStatus | "needs_email"
  >("all");

  const orgQ = `org=${encodeURIComponent(organizationId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}?${orgQ}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        event?: EventDetail;
        participants?: Participant[];
        emailSummary?: EmailSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEvent(data.event ?? null);
      setParticipants(data.participants ?? []);
      setEmailSummary(data.emailSummary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [eventId, orgQ]);

  const loadCycles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/trip/roster-cycles?${orgQ}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        cycles?: RosterCycleOption[];
        error?: string;
      };
      if (!res.ok) return;
      const cycles = data.cycles ?? [];
      setRosterCycles(cycles);
      setCycleId((prev) => prev || cycles[0]?.id || "");
    } catch {
      // non-fatal — manual paste still works
    }
  }, [orgQ]);

  useEffect(() => {
    void load();
    void loadCycles();
  }, [load, loadCycles]);

  const summary = useMemo(() => {
    const s = { total: 0, not_started: 0, draft: 0, submitted: 0 };
    for (const p of participants) {
      s.total++;
      if (p.status === "submitted") s.submitted++;
      else if (p.status === "draft") s.draft++;
      else s.not_started++;
    }
    return s;
  }, [participants]);

  const selectedCycle = rosterCycles.find((c) => c.id === cycleId) ?? null;

  const emailReady = useMemo(() => {
    return participants.filter((p) => {
      const email =
        p.guardianEmail ||
        (typeof p.answers?.guardian1_email === "string"
          ? p.answers.guardian1_email
          : null) ||
        p.submitterEmail;
      return Boolean(email && String(email).trim());
    });
  }, [participants]);

  const derivedEmailSummary = useMemo((): EmailSummary => {
    if (emailSummary) return emailSummary;
    let withEmail = 0;
    let noEmail = 0;
    let sent = 0;
    let notSent = 0;
    let failed = 0;
    let suppressed = 0;
    for (const p of participants) {
      const st = resolveEmailStatus(p);
      if (st === "no_email") noEmail++;
      else withEmail++;
      if (st === "sent") sent++;
      else if (st === "not_sent") notSent++;
      else if (st === "failed") failed++;
      else if (st === "suppressed") suppressed++;
    }
    return {
      total: participants.length,
      withEmail,
      noEmail,
      sent,
      notSent,
      failed,
      suppressed,
    };
  }, [participants, emailSummary]);

  const filteredParticipants = useMemo(() => {
    if (emailFilter === "all") return participants;
    if (emailFilter === "needs_email") {
      return participants.filter((p) => {
        const st = resolveEmailStatus(p);
        return st === "not_sent" || st === "failed" || st === "no_email";
      });
    }
    return participants.filter((p) => resolveEmailStatus(p) === emailFilter);
  }, [participants, emailFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllWithEmail() {
    setSelectedIds(new Set(emailReady.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function sendInviteEmails(mode: "selected" | "all_with_email") {
    setEmailing(true);
    setError(null);
    setEmailNote(null);
    try {
      const participantIds =
        mode === "selected"
          ? Array.from(selectedIds)
          : emailReady.map((p) => p.id);
      if (participantIds.length === 0) {
        throw new Error("No players with guardian email selected");
      }
      const res = await fetch(
        `/api/admin/trip/events/${eventId}/invite-emails?${orgQ}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantIds,
            resend: resendAlready,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        sent?: number;
        failed?: number;
        skipped?: Array<{ playerFullName: string; reason: string }>;
        campaignId?: string | null;
      };
      if (!res.ok) {
        // Surface partial-send info when present
        const partial =
          typeof data.sent === "number"
            ? ` (reported sent: ${data.sent}${typeof data.failed === "number" ? `, failed: ${data.failed}` : ""})`
            : "";
        throw new Error((data.error || "Send failed") + partial);
      }
      const skipN = data.skipped?.length ?? 0;
      setEmailNote(
        `Sent ${data.sent ?? 0}` +
          (data.failed ? `, failed ${data.failed}` : "") +
          (skipN ? `, skipped ${skipN}` : "") +
          (data.campaignId
            ? ` · logged in Communications (${data.campaignId.slice(0, 8)}…)`
            : ""),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      // Refresh so inviteEmailCount reflects any successful sends
      try {
        await load();
      } catch {
        /* ignore */
      }
    } finally {
      setEmailing(false);
    }
  }

  async function importFromRoster(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleId) return;
    setImporting(true);
    setError(null);
    setImportNote(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}/import-roster?${orgQ}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId, rosterTeam }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        created?: number;
        skipped?: number;
        sourceCount?: number;
        contactMatched?: number;
        cycle?: { label: string };
      };
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportNote(
        `Imported ${data.created ?? 0} of ${data.sourceCount ?? 0} from ${data.cycle?.label ?? "roster"}` +
          (data.skipped ? ` (${data.skipped} already on trip)` : "") +
          (typeof data.contactMatched === "number"
            ? ` · ${data.contactMatched} with guardian contact match`
            : ""),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function addPlayers(e: React.FormEvent) {
    e.preventDefault();
    if (!namesText.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}/participants?${orgQ}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ namesText }),
        },
      );
      const data = (await res.json()) as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error || "Add failed");
      setNamesText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(status: string) {
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}?${orgQ}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setStatusBusy(false);
    }
  }

  async function copyLink(p: Participant) {
    try {
      await navigator.clipboard.writeText(p.inviteUrl);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Could not copy link");
    }
  }

  function exportUrl(opts: { sheetOnly?: boolean; inviteUrls?: boolean }) {
    const params = new URLSearchParams();
    params.set("org", organizationId);
    if (opts.sheetOnly === false) params.set("sheetOnly", "0");
    if (opts.inviteUrls) params.set("inviteUrls", "1");
    return `/api/admin/trip/events/${eventId}/export?${params.toString()}`;
  }

  if (loading && !event) {
    return <p className="text-sm text-zinc-500">Loading event…</p>;
  }

  if (!event) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-300">{error || "Event not found"}</p>
        <Link href={`/admin/travel?${orgQ}`} className="text-sm text-amber-300 hover:underline">
          ← Back to Travel desk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/travel?${orgQ}`}
            className="mb-2 inline-block text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← All trip events
          </Link>
          <h2 className="text-2xl font-bold text-zinc-50">{event.name}</h2>
          {event.teamLabel && (
            <p className="text-sm text-zinc-400">{event.teamLabel}</p>
          )}
          {event.googleSheetUrl && (
            <a
              href={event.googleSheetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-sky-400 hover:underline"
            >
              Open Google Sheet ↗
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
              event.status === "open"
                ? "border-emerald-700/50 text-emerald-300"
                : event.status === "closed"
                  ? "border-zinc-600 text-zinc-400"
                  : "border-amber-700/40 text-amber-200"
            }`}
          >
            {event.status}
          </span>
          {event.status !== "open" && (
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void setStatus("open")}
              className="rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-50"
            >
              Open for parents
            </button>
          )}
          {event.status === "open" && (
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void setStatus("closed")}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Players" value={summary.total} />
        <Stat label="Submitted" value={summary.submitted} accent="emerald" />
        <Stat label="Draft" value={summary.draft} accent="amber" />
        <Stat label="Not started" value={summary.not_started} />
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={exportUrl({ sheetOnly: true })}
          className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-950/50"
          title="Tournament director CSV — roster columns only, no health"
        >
          Export director CSV
        </a>
        <a
          href={exportUrl({ sheetOnly: false, inviteUrls: true })}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
        >
          Export + invite links
        </a>
        <a
          href={`/api/admin/trip/events/${eventId}/player-sheets?${orgQ}&format=html&layout=full`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-950/50"
        >
          Print player sheets
        </a>
        <a
          href={`/api/admin/trip/events/${eventId}/player-sheets?${orgQ}&format=html&layout=cards`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
        >
          Compact cards
        </a>
        <a
          href={`/api/admin/trip/events/${eventId}/player-sheets?${orgQ}&format=pdf`}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
        >
          Download PDF
        </a>
      </div>
      <p className="text-xs text-zinc-500 -mt-4">
        Player sheets include health for coaching staff only. Director CSV never
        includes health fields.
      </p>

      <div className="rounded-2xl border border-violet-900/40 bg-violet-950/15 p-4">
        <h3 className="mb-1 font-semibold text-zinc-100">
          Email parent invite links
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Sends each guardian a personalized magic link via Resend (same stack as
          Communications). Uses guardian email from roster import or form draft.
          Event must be <span className="text-zinc-300">open</span>.
        </p>

        {/* Email status summary */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <EmailStatChip
            label="Sent"
            value={derivedEmailSummary.sent}
            tone="violet"
            active={emailFilter === "sent"}
            onClick={() =>
              setEmailFilter((f) => (f === "sent" ? "all" : "sent"))
            }
          />
          <EmailStatChip
            label="Not sent"
            value={derivedEmailSummary.notSent}
            tone="amber"
            active={emailFilter === "not_sent"}
            onClick={() =>
              setEmailFilter((f) => (f === "not_sent" ? "all" : "not_sent"))
            }
          />
          <EmailStatChip
            label="Failed"
            value={derivedEmailSummary.failed}
            tone="red"
            active={emailFilter === "failed"}
            onClick={() =>
              setEmailFilter((f) => (f === "failed" ? "all" : "failed"))
            }
          />
          <EmailStatChip
            label="No email"
            value={derivedEmailSummary.noEmail}
            tone="zinc"
            active={emailFilter === "no_email"}
            onClick={() =>
              setEmailFilter((f) => (f === "no_email" ? "all" : "no_email"))
            }
          />
          <EmailStatChip
            label="With address"
            value={derivedEmailSummary.withEmail}
            tone="zinc"
            active={emailFilter === "all"}
            onClick={() => setEmailFilter("all")}
          />
          <EmailStatChip
            label="Needs action"
            value={
              derivedEmailSummary.notSent +
              derivedEmailSummary.failed +
              derivedEmailSummary.noEmail
            }
            tone="amber"
            active={emailFilter === "needs_email"}
            onClick={() =>
              setEmailFilter((f) =>
                f === "needs_email" ? "all" : "needs_email",
              )
            }
          />
        </div>
        {emailFilter !== "all" && (
          <p className="mb-3 text-xs text-zinc-400">
            Filtering roster by{" "}
            <span className="text-zinc-200">
              {emailFilter === "needs_email"
                ? "needs action"
                : emailFilter.replace("_", " ")}
            </span>
            .{" "}
            <button
              type="button"
              className="text-violet-300 hover:underline"
              onClick={() => setEmailFilter("all")}
            >
              Show all
            </button>
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={selectAllWithEmail}
            className="text-xs text-violet-300 hover:underline"
          >
            Select all with email
          </button>
          <button
            type="button"
            onClick={() => {
              const need = participants.filter((p) => {
                const st = resolveEmailStatus(p);
                return st === "not_sent" || st === "failed";
              });
              setSelectedIds(new Set(need.map((p) => p.id)));
            }}
            className="text-xs text-amber-300/90 hover:underline"
          >
            Select not sent / failed
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-zinc-500 hover:underline"
          >
            Clear selection
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={resendAlready}
              onChange={(ev) => setResendAlready(ev.target.checked)}
              className="rounded border-zinc-600"
            />
            Resend even if already emailed
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={emailing || selectedIds.size === 0 || event.status !== "open"}
            onClick={() => void sendInviteEmails("selected")}
            className="rounded-lg border border-violet-600/60 bg-violet-950/40 px-4 py-2 text-sm font-semibold text-violet-100 disabled:opacity-50"
          >
            {emailing
              ? "Sending…"
              : `Email selected (${selectedIds.size})`}
          </button>
          <button
            type="button"
            disabled={
              emailing || emailReady.length === 0 || event.status !== "open"
            }
            onClick={() => void sendInviteEmails("all_with_email")}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
          >
            Email all with address ({emailReady.length})
          </button>
        </div>
        {event.status !== "open" && (
          <p className="mt-2 text-xs text-amber-200/90">
            Open the event for parents before sending invite emails.
          </p>
        )}
        {emailNote && (
          <p className="mt-3 text-sm text-violet-200/90">{emailNote}</p>
        )}
      </div>

      <form
        onSubmit={importFromRoster}
        className="rounded-2xl border border-emerald-900/40 bg-emerald-950/15 p-4"
      >
        <h3 className="mb-1 font-semibold text-zinc-100">
          Import from finalized All-Star roster
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Pulls SELECTED / SECOND_TEAM players from the Vault final roster. Prefills
          first/last name, uniform #, and guardian name/email when a TeamPlayer
          contact match is found. Positions, bats, and throws still need parent
          input. Safe to re-run — existing players are skipped.
        </p>
        {rosterCycles.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No finalized rosters found for this organization yet. Finalize the
            cycle in the All-Star Vault, or paste names below.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-zinc-400">Ballot cycle</span>
              <select
                value={cycleId}
                onChange={(ev) => setCycleId(ev.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              >
                {rosterCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.selectedCount} first
                    {c.secondTeamCount > 0
                      ? ` / ${c.secondTeamCount} second`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-400">Roster team</span>
              <select
                value={rosterTeam}
                onChange={(ev) =>
                  setRosterTeam(ev.target.value as "first" | "second" | "both")
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              >
                <option value="both">
                  Both teams
                  {selectedCycle
                    ? ` (${selectedCycle.selectedCount + selectedCycle.secondTeamCount})`
                    : ""}
                </option>
                <option value="first">
                  First team only
                  {selectedCycle ? ` (${selectedCycle.selectedCount})` : ""}
                </option>
                <option value="second">
                  Second team only
                  {selectedCycle ? ` (${selectedCycle.secondTeamCount})` : ""}
                </option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={importing || !cycleId}
                className="w-full rounded-lg border border-emerald-600/60 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import roster + generate links"}
              </button>
            </div>
          </div>
        )}
        {importNote && (
          <p className="mt-3 text-sm text-emerald-200/90">{importNote}</p>
        )}
      </form>

      <form
        onSubmit={addPlayers}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <h3 className="mb-1 font-semibold text-zinc-100">Add players manually</h3>
        <p className="mb-3 text-xs text-zinc-500">
          One full name per line. Each player gets a unique magic link for parents.
        </p>
        <textarea
          value={namesText}
          onChange={(ev) => setNamesText(ev.target.value)}
          rows={5}
          placeholder={"Alex Rivera\nJordan Lee\nSam Patel"}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
        />
        <button
          type="submit"
          disabled={adding || !namesText.trim()}
          className="mt-3 rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add & generate links"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium w-8" />
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Form</th>
              <th className="px-3 py-2 font-medium">Guardian email</th>
              <th className="px-3 py-2 font-medium">Email status</th>
              <th className="px-3 py-2 font-medium">Invite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {participants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No players yet — import roster or paste names above.
                </td>
              </tr>
            ) : filteredParticipants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No players match this email filter.{" "}
                  <button
                    type="button"
                    className="text-violet-300 hover:underline"
                    onClick={() => setEmailFilter("all")}
                  >
                    Show all
                  </button>
                </td>
              </tr>
            ) : (
              filteredParticipants.map((p) => {
                const gEmail =
                  p.guardianEmail ||
                  (typeof p.answers?.guardian1_email === "string"
                    ? String(p.answers.guardian1_email)
                    : null) ||
                  p.submitterEmail ||
                  null;
                const hasEmail = Boolean(gEmail && String(gEmail).trim());
                const emailSt = resolveEmailStatus(p);
                return (
                  <tr key={p.id} className="hover:bg-zinc-900/50">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!hasEmail}
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelected(p.id)}
                        className="rounded border-zinc-600"
                        aria-label={`Select ${p.playerFullName}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-zinc-100">
                        {p.playerFullName}
                      </p>
                      {p.jerseyNumber && (
                        <p className="text-xs text-zinc-500">#{p.jerseyNumber}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusDot status={p.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400">
                      {hasEmail ? (
                        <>
                          <p className="text-zinc-300">{gEmail}</p>
                          {(p.submitterName ||
                            (typeof p.answers?.guardian1_first_name ===
                              "string" &&
                              p.answers.guardian1_first_name)) && (
                            <p className="text-zinc-500">
                              {p.submitterName ||
                                [
                                  p.answers.guardian1_first_name,
                                  p.answers.guardian1_last_name,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-600/80">No email</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <EmailStatusCell
                        status={emailSt}
                        count={p.inviteEmailCount ?? 0}
                        sentAt={p.inviteEmailSentAt}
                        to={p.inviteEmailTo || gEmail}
                        lastDelivery={p.lastDelivery}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => void copyLink(p)}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-600/50 hover:text-amber-200"
                      >
                        {copiedId === p.id ? "Copied!" : "Copy link"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "submitted"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-amber-400"
        : "bg-zinc-600";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 capitalize">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {status.replace("_", " ")}
    </span>
  );
}

function resolveEmailStatus(p: Participant): EmailStatus {
  if (p.emailStatus) return p.emailStatus;
  const email =
    p.guardianEmail ||
    (typeof p.answers?.guardian1_email === "string"
      ? p.answers.guardian1_email
      : null) ||
    p.submitterEmail;
  if (!email || !String(email).trim()) return "no_email";
  if ((p.inviteEmailCount ?? 0) > 0) return "sent";
  const ld = p.lastDelivery?.status;
  if (ld === "SENT") return "sent";
  if (ld === "SKIPPED_SUPPRESSED" || ld === "SKIPPED_NO_CONSENT") {
    return "suppressed";
  }
  if (ld === "FAILED" || (ld && ld.startsWith("SKIPPED"))) return "failed";
  return "not_sent";
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function EmailStatChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "violet" | "amber" | "red" | "zinc";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    violet: "border-violet-700/50 bg-violet-950/40 text-violet-100",
    amber: "border-amber-700/40 bg-amber-950/30 text-amber-100",
    red: "border-red-800/40 bg-red-950/30 text-red-100",
    zinc: "border-zinc-700/50 bg-zinc-900/50 text-zinc-200",
  };
  const ring = active ? "ring-1 ring-violet-400/60" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left transition hover:brightness-110 ${tones[tone]} ${ring}`}
    >
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </button>
  );
}

function EmailStatusCell({
  status,
  count,
  sentAt,
  to,
  lastDelivery,
}: {
  status: EmailStatus;
  count: number;
  sentAt?: string | null;
  to?: string | null;
  lastDelivery?: LastDelivery | null;
}) {
  const when =
    formatWhen(sentAt) ||
    formatWhen(lastDelivery?.sentAt) ||
    formatWhen(lastDelivery?.attemptedAt);

  if (status === "sent") {
    return (
      <div className="text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-700/40 bg-violet-950/40 px-2 py-0.5 font-medium text-violet-200">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          Sent{count > 1 ? ` · ${count}×` : ""}
        </span>
        {when && <p className="mt-1 text-zinc-500">{when}</p>}
        {to && (
          <p className="mt-0.5 max-w-[14rem] truncate text-zinc-600" title={to}>
            → {to}
          </p>
        )}
      </div>
    );
  }

  if (status === "failed") {
    const err = lastDelivery?.errorMessage?.trim();
    return (
      <div className="text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-800/50 bg-red-950/40 px-2 py-0.5 font-medium text-red-200">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Failed
        </span>
        {when && <p className="mt-1 text-zinc-500">{when}</p>}
        {err && (
          <p
            className="mt-0.5 max-w-[14rem] truncate text-red-300/80"
            title={err}
          >
            {err}
          </p>
        )}
      </div>
    );
  }

  if (status === "suppressed") {
    return (
      <div className="text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-900 px-2 py-0.5 font-medium text-zinc-300">
          Suppressed
        </span>
        <p className="mt-1 text-zinc-500">On unsubscribe list</p>
      </div>
    );
  }

  if (status === "no_email") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-200/90">
        No email
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-xs font-medium text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      Not sent
    </span>
  );
}
