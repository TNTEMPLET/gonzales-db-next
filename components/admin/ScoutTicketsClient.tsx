"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  GMAIL_ACCESS_NOT_GRANTED_MESSAGE,
  SCOUT_ORG_LABELS,
  SCOUT_ORG_TAGS,
  SCOUT_STATUS_LABELS,
  SCOUT_TICKET_STATUSES,
  type ScoutOrgTag,
  type ScoutTicketStatus,
} from "@/lib/scout/config";
import { formatScoutWhen } from "@/lib/scout/formatWhen";
import { scoutTicketsHref } from "@/lib/scout/links";
import { scoutFiltersActive, scoutTicketListSummary } from "@/lib/scout/listQuery";
import {
  applyScoutSyncReport,
  applyScoutTicketsPayload,
  notifyScoutDataChanged,
  scoutPagePropKey,
  scoutSyncRunNotice,
  type ScoutSyncClientReport,
  type ScoutTicketsPayload,
} from "@/lib/scout/pageRefresh";
import {
  readScoutSaveFeedback,
  rememberScoutSaveFeedback,
  type ScoutSaveFeedback,
} from "@/lib/scout/saveFeedback";
import { SCOUT_STORAGE_NOT_READY, scoutUiText } from "@/lib/scout/storageError";
import type { ScoutPageModel, ScoutTicketDetail } from "@/lib/scout/view";

const SENDER_FILTER_DEBOUNCE_MS = 400;

function senderLine(name: string | null, email: string): string {
  return name ? `${name} · ${email}` : email;
}

function statusClass(status: ScoutTicketStatus): string {
  if (status === "NEW") return "bg-red-950/60 text-red-100";
  if (status === "OPEN") return "bg-amber-950/50 text-amber-100";
  return "bg-zinc-800 text-zinc-400";
}

function ticketHref(org: string, model: ScoutPageModel, id: string): string {
  return scoutTicketsHref({
    shellOrg: org,
    status: model.filters.status,
    orgTag: model.filters.orgTag,
    sender: model.filters.sender,
    ticketId: id,
  });
}

function TicketEditor({ ticket, onSaved }: { ticket: ScoutTicketDetail; onSaved: () => void }) {
  const [status, setStatus] = useState<ScoutTicketStatus>(ticket.status);
  const [seenStatus, setSeenStatus] = useState(ticket.status);
  if (ticket.status !== seenStatus) {
    setSeenStatus(ticket.status);
    setStatus(ticket.status);
  }
  const [orgTag, setOrgTag] = useState<string>(ticket.orgTag ?? "");
  const [notes, setNotes] = useState(ticket.notes);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<ScoutSaveFeedback | null>(() => readScoutSaveFeedback(ticket.id));

  function showFeedback(next: ScoutSaveFeedback | null) {
    rememberScoutSaveFeedback(ticket.id, next);
    setFeedback(next);
  }

  async function save() {
    setSaving(true);
    showFeedback(null);
    try {
      const res = await fetch(`/api/admin/scout/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          orgTag: orgTag === "" ? null : orgTag,
          notes,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        showFeedback({ tone: "error", text: scoutUiText(json?.error) || "Could not save." });
        return;
      }
      showFeedback({ tone: "ok", text: "Saved" });
      onSaved();
    } catch {
      showFeedback({ tone: "error", text: "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{ticket.subject}</h2>
          <p className="mt-1 text-sm text-zinc-400">{senderLine(ticket.senderName, ticket.senderEmail)}</p>
        </div>
        <a
          href={ticket.gmailUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-red-200 hover:text-red-100"
        >
          Open in Gmail
        </a>
      </div>

      <ol className="mt-4 divide-y divide-zinc-800">
        {ticket.messages.map((message) => (
          <li key={message.id} className="py-3">
            <p className="text-xs text-zinc-500">
              {senderLine(message.senderName, message.senderEmail)} · {formatScoutWhen(message.receivedAt)}
            </p>
            <p className="mt-1 text-sm text-zinc-200">{message.snippet || "No snippet."}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-500">
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ScoutTicketStatus);
              showFeedback(null);
            }}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            {SCOUT_TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SCOUT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-500">
          Org
          <select
            value={orgTag}
            onChange={(event) => {
              setOrgTag(event.target.value);
              showFeedback(null);
            }}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="">None</option>
            {SCOUT_ORG_TAGS.map((value) => (
              <option key={value} value={value}>
                {SCOUT_ORG_LABELS[value as ScoutOrgTag]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-xs text-zinc-500">
        Notes
        <textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            showFeedback(null);
          }}
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
        />
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:border-red-900/60 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {feedback ? (
          <p
            role={feedback.tone === "error" ? "alert" : "status"}
            className={`text-sm ${feedback.tone === "error" ? "text-red-300" : "text-emerald-300"}`}
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function ScoutTicketsClient({ model, org }: { model: ScoutPageModel; org: string }) {
  const router = useRouter();
  const propKey = scoutPagePropKey(model);
  const [seenPropKey, setSeenPropKey] = useState(propKey);
  const [live, setLive] = useState(model);
  const pullGen = useRef(0);
  const propKeyRef = useRef(propKey);
  if (propKey !== seenPropKey) {
    setSeenPropKey(propKey);
    setLive(model);
  }
  const view = live;
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(model.filters.status);
  const [orgTagFilter, setOrgTagFilter] = useState(model.filters.orgTag);
  const [senderFilter, setSenderFilter] = useState(model.filters.sender);
  const [seenFilterKey, setSeenFilterKey] = useState(
    `${model.filters.status}|${model.filters.orgTag}|${model.filters.sender}`,
  );
  const [expectedFilterHref, setExpectedFilterHref] = useState<string | null>(null);
  const senderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRef = useRef(view);
  const statusFilterRef = useRef(statusFilter);
  const orgTagFilterRef = useRef(orgTagFilter);

  useEffect(() => {
    propKeyRef.current = propKey;
  }, [propKey]);

  useEffect(() => {
    viewRef.current = view;
    statusFilterRef.current = statusFilter;
    orgTagFilterRef.current = orgTagFilter;
  }, [view, statusFilter, orgTagFilter]);

  useEffect(() => {
    return () => {
      if (senderTimer.current) clearTimeout(senderTimer.current);
    };
  }, []);

  const filterKey = `${view.filters.status}|${view.filters.orgTag}|${view.filters.sender}`;
  if (filterKey !== seenFilterKey) {
    const arrived = scoutTicketsHref({
      shellOrg: org,
      status: view.filters.status,
      orgTag: view.filters.orgTag,
      sender: view.filters.sender,
    });
    setSeenFilterKey(filterKey);
    if (expectedFilterHref === null || expectedFilterHref === arrived) {
      setStatusFilter(view.filters.status);
      setOrgTagFilter(view.filters.orgTag);
      setSenderFilter(view.filters.sender);
      setExpectedFilterHref(null);
    }
  }

  function publishFilters(next: { status: string; orgTag: string; sender: string }) {
    const current = viewRef.current;
    const filterOnly = scoutTicketsHref({
      shellOrg: org,
      status: next.status,
      orgTag: next.orgTag,
      sender: next.sender,
    });
    const applied = scoutTicketsHref({
      shellOrg: org,
      status: current.filters.status,
      orgTag: current.filters.orgTag,
      sender: current.filters.sender,
    });
    if (filterOnly === applied) {
      setExpectedFilterHref(null);
      return;
    }
    setExpectedFilterHref(filterOnly);
    router.replace(
      scoutTicketsHref({
        shellOrg: org,
        status: next.status,
        orgTag: next.orgTag,
        sender: next.sender,
        ticketId: current.selected?.id ?? null,
      }),
      { scroll: false },
    );
  }

  function applyFilters(next: { status: string; orgTag: string; sender: string }) {
    if (senderTimer.current) clearTimeout(senderTimer.current);
    publishFilters(next);
  }

  function onSenderChange(value: string) {
    setSenderFilter(value);
    if (senderTimer.current) clearTimeout(senderTimer.current);
    senderTimer.current = setTimeout(() => {
      publishFilters({
        status: statusFilterRef.current,
        orgTag: orgTagFilterRef.current,
        sender: value.trim(),
      });
    }, SENDER_FILTER_DEBOUNCE_MS);
  }

  async function pullScoutView() {
    const gen = ++pullGen.current;
    const startedPropKey = propKeyRef.current;
    notifyScoutDataChanged();
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch(`/api/admin/scout/tickets?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (Partial<ScoutTicketsPayload> & { error?: string }) | null;
      if (gen !== pullGen.current || propKeyRef.current !== startedPropKey) return;
      const sync = json?.sync;
      const tickets = json?.tickets;
      if (!res.ok || !sync || !Array.isArray(tickets)) {
        if (res.status === 503 || scoutUiText(json?.error) === SCOUT_STORAGE_NOT_READY) {
          setLive((current) => ({ ...current, storageMessage: SCOUT_STORAGE_NOT_READY }));
        }
        return;
      }
      const selected = json?.selected ?? null;
      const attentionCount = json?.attentionCount ?? 0;
      setLive((current) =>
        applyScoutTicketsPayload(current, {
          tickets,
          selected,
          sync,
          attentionCount,
        }),
      );
    } catch {
      // Keep the optimistic sync line if the follow-up read fails.
    } finally {
      if (gen === pullGen.current) router.refresh();
    }
  }

  async function runNow() {
    setRunning(true);
    setNotice(null);
    const nowIso = new Date().toISOString();
    try {
      const res = await fetch("/api/admin/scout/sync", { method: "POST" });
      const json = (await res.json()) as ScoutSyncClientReport;
      const errorText = json.error ? scoutUiText(json.error) || "Sync failed." : !res.ok ? "Sync failed." : null;
      if (errorText === SCOUT_STORAGE_NOT_READY) {
        setLive((current) => ({ ...current, storageMessage: SCOUT_STORAGE_NOT_READY }));
      } else {
        setNotice(
          scoutSyncRunNotice({
            httpOk: res.ok,
            error: errorText,
            backfillPending: Boolean(json.backfillPending),
          }),
        );
        setLive((current) =>
          applyScoutSyncReport(
            current,
            { ok: res.ok && !errorText, error: errorText, backfillPending: json.backfillPending },
            nowIso,
          ),
        );
      }
      await pullScoutView();
    } catch {
      setNotice(null);
      setLive((current) => applyScoutSyncReport(current, { ok: false, error: "Sync failed." }, nowIso));
    } finally {
      setRunning(false);
    }
  }

  async function loadSamples() {
    setSeeding(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/scout/seed", { method: "POST" });
      const json = (await res.json()) as { error?: string };
      setNotice(
        res.ok ? "Sample tickets loaded." : scoutUiText(json.error) || "Could not load sample tickets.",
      );
      if (res.ok) await pullScoutView();
    } catch {
      setNotice("Could not load sample tickets.");
    } finally {
      setSeeding(false);
    }
  }

  const lastError = scoutUiText(view.sync.lastError);
  const accessPending = lastError === GMAIL_ACCESS_NOT_GRANTED_MESSAGE;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:border-red-900/60 disabled:opacity-60"
        >
          {running ? "Running…" : "Run Scout now"}
        </button>
        {view.seedAllowed ? (
          <button
            type="button"
            onClick={() => void loadSamples()}
            disabled={seeding}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
          >
            {seeding ? "Loading…" : "Load sample tickets"}
          </button>
        ) : null}
        <p className="text-xs text-zinc-500">
          Last run {formatScoutWhen(view.sync.lastRunAt)}
          {view.sync.lastSuccessAt ? ` · Last success ${formatScoutWhen(view.sync.lastSuccessAt)}` : ""}
        </p>
      </div>

      {view.storageMessage ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          {view.storageMessage}
        </p>
      ) : null}

      {view.sync.backfillPending ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          Scout is still catching up on this inbox. It continues about every 15 minutes.
        </p>
      ) : null}

      {lastError ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            accessPending
              ? "border-zinc-700 bg-zinc-900 text-zinc-300"
              : "border-red-900/40 bg-red-950/20 text-red-100"
          }`}
        >
          {lastError}
        </p>
      ) : null}

      {notice ? <p className="text-sm text-zinc-400">{notice}</p> : null}

      <form
        action="/admin/tickets"
        method="get"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters({ status: statusFilter, orgTag: orgTagFilter, sender: senderFilter.trim() });
        }}
      >
        <input type="hidden" name="org" value={org} />
        <label className="text-xs text-zinc-500">
          Status
          <select
            name="status"
            value={statusFilter}
            onChange={(event) => {
              const status = event.target.value;
              setStatusFilter(status);
              applyFilters({ status, orgTag: orgTagFilter, sender: senderFilter.trim() });
            }}
            className="mt-1 block rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="all">All</option>
            {SCOUT_TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SCOUT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Org
          <select
            name="orgTag"
            value={orgTagFilter}
            onChange={(event) => {
              const orgTag = event.target.value;
              setOrgTagFilter(orgTag);
              applyFilters({ status: statusFilter, orgTag, sender: senderFilter.trim() });
            }}
            className="mt-1 block rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="all">All</option>
            <option value="none">None</option>
            {SCOUT_ORG_TAGS.map((value) => (
              <option key={value} value={value}>
                {SCOUT_ORG_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Sender
          <input
            name="sender"
            value={senderFilter}
            onChange={(event) => onSenderChange(event.target.value)}
            placeholder="Email contains"
            className="mt-1 block rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100"
        >
          Filter
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-zinc-500">
            {scoutTicketListSummary({
              ticketCount: view.tickets.length,
              attentionCount: view.attentionCount,
              filtersActive: scoutFiltersActive(view.filters),
            })}
          </p>
          {view.tickets.length === 0 ? (
            <p className="rounded-xl border border-zinc-800 px-4 py-6 text-sm text-zinc-400">
              No tickets yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
              {view.tickets.map((ticket) => {
                const active = view.selected?.id === ticket.id;
                return (
                  <li key={ticket.id}>
                    <Link
                      href={ticketHref(org, view, ticket.id)}
                      className={`block px-4 py-3 ${active ? "bg-zinc-900" : "hover:bg-zinc-900/50"}`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-medium text-zinc-100">{ticket.subject}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusClass(ticket.status)}`}>
                          {SCOUT_STATUS_LABELS[ticket.status]}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {senderLine(ticket.senderName, ticket.senderEmail)} · {formatScoutWhen(ticket.lastMessageAt)}
                        {ticket.orgTag ? ` · ${SCOUT_ORG_LABELS[ticket.orgTag]}` : ""}
                      </span>
                      {ticket.snippet ? (
                        <span className="mt-1 block line-clamp-2 text-sm text-zinc-400">{ticket.snippet}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          {view.selected ? (
            <TicketEditor key={view.selected.id} ticket={view.selected} onSaved={() => void pullScoutView()} />
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-sm text-zinc-500">
              Select a ticket.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
