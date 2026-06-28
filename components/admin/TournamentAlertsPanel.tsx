"use client";

import { useEffect, useState } from "react";

import { formatTournamentDateTime } from "@/lib/tournament-monitor/formatDateTime";

type Subscription = { id: string; name: string; email: string | null; phone: string | null; channels: Array<"EMAIL" | "SMS">; active: boolean };
type MonitorEvent = { id: string; type: string; title: string; message: string; emailSentCount: number; smsSentCount: number; failedCount: number; createdAt: string };
type MonitorRun = { id: string; status: string; checkedCount: number; eventCount: number; sentCount: number; failedCount: number; createdAt: string; completedAt: string | null } | null;
type Payload = { providerStatus: { emailConfigured: boolean; smsConfigured: boolean }; subscriptions: Subscription[]; events: MonitorEvent[]; lastRun: MonitorRun };

async function readJson(response: Response) { return response.json().catch(() => ({})); }

export default function TournamentAlertsPanel() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", emailEnabled: true, smsEnabled: true });

  async function load() {
    const response = await fetch("/api/admin/tournament-monitor", { cache: "no-store" });
    const json = await readJson(response);
    if (!response.ok) throw new Error(String(json.error || "Failed to load tournament alerts"));
    setPayload(json.data as Payload);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load tournament alerts")); }, []);

  async function saveSubscription() {
    setBusy(true); setError(""); setNotice("");
    try {
      const channels = [form.emailEnabled ? "EMAIL" : null, form.smsEnabled ? "SMS" : null].filter(Boolean);
      const response = await fetch("/api/admin/tournament-monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-subscription", name: form.name, email: form.email, phone: form.phone, channels }) });
      const json = await readJson(response); if (!response.ok) throw new Error(String(json.error || "Failed to save alert recipient"));
      setForm({ name: "", email: "", phone: "", emailEnabled: true, smsEnabled: true });
      setNotice("Alert recipient saved."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save alert recipient"); }
    finally { setBusy(false); }
  }

  async function deleteSubscription(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/tournament-monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-subscription", id }) });
      const json = await readJson(response); if (!response.ok) throw new Error(String(json.error || "Failed to delete alert recipient"));
      setNotice("Alert recipient removed."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete alert recipient"); }
    finally { setBusy(false); }
  }

  async function sendTestAlert() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/tournament-monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test-alert" }) });
      const json = await readJson(response); if (!response.ok) throw new Error(String(json.error || "Failed to send test alert"));
      setNotice("Test alert sent to active recipients."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to send test alert"); }
    finally { setBusy(false); }
  }

  return (
    <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 text-white shadow-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">Tournament Alerts</p>
          <h2 className="mt-1 text-2xl font-bold">Email and text status updates</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">Get downtime alerts, live-game heartbeats, final scores, and GameChanger creation confirmations during active tournaments.</p>
        </div>
        <button type="button" disabled={busy || !payload?.subscriptions.length} onClick={() => void sendTestAlert()} className="rounded-lg border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-gold hover:bg-brand-gold/10 disabled:opacity-50">Send test alert</button>
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="text-zinc-500">Email provider</div><div className={payload?.providerStatus.emailConfigured ? "text-emerald-300" : "text-amber-300"}>{payload?.providerStatus.emailConfigured ? "Configured" : "Needs setup"}</div></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="text-zinc-500">SMS provider</div><div className={payload?.providerStatus.smsConfigured ? "text-emerald-300" : "text-amber-300"}>{payload?.providerStatus.smsConfigured ? "Configured" : "Needs Twilio setup"}</div></div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="text-zinc-500">Last monitor run</div><div className="text-zinc-100">{payload?.lastRun ? `${payload.lastRun.status} · ${payload.lastRun.eventCount} alerts · ${formatTournamentDateTime(payload.lastRun.completedAt ?? payload.lastRun.createdAt)}` : "Not run yet"}</div></div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto_auto]">
        <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Recipient name" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <input value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} placeholder="Email" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <input value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} placeholder="Cell phone" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.emailEnabled} onChange={(e) => setForm((current) => ({ ...current, emailEnabled: e.target.checked }))} />Email</label>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.smsEnabled} onChange={(e) => setForm((current) => ({ ...current, smsEnabled: e.target.checked }))} />Text</label>
        <button type="button" disabled={busy} onClick={() => void saveSubscription()} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50">Add</button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Recipients</div>
          {(payload?.subscriptions.length ?? 0) === 0 ? <p className="p-3 text-sm text-zinc-500">No alert recipients yet.</p> : payload?.subscriptions.map((sub) => <div key={sub.id} className="flex items-center justify-between gap-3 border-b border-zinc-800 p-3 text-sm last:border-b-0"><div><div className="font-semibold">{sub.name}</div><div className="text-xs text-zinc-500">{[sub.email, sub.phone].filter(Boolean).join(" · ")} · {sub.channels.join("+")}</div></div><button type="button" disabled={busy} onClick={() => void deleteSubscription(sub.id)} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-500 hover:text-red-200">Remove</button></div>)}
        </div>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Recent alerts</div>
          {(payload?.events.length ?? 0) === 0 ? <p className="p-3 text-sm text-zinc-500">No alerts sent yet.</p> : payload?.events.slice(0, 8).map((event) => <div key={event.id} className="border-b border-zinc-800 p-3 text-sm last:border-b-0"><div className="font-semibold">{event.title}</div><div className="text-xs text-zinc-500">{formatTournamentDateTime(event.createdAt)} · {event.type} · email {event.emailSentCount} · text {event.smsSentCount} · failed {event.failedCount}</div></div>)}
        </div>
      </div>
    </section>
  );
}
