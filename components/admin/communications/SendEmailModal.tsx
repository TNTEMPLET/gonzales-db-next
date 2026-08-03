"use client";

import { useState } from "react";

/** Client-safe mirror of lib/communications/rawContacts.ts's RawContactInput — no server import. */
export type RawContactInputClient = {
  email: string;
  name?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

type SendEmailModalProps = {
  open: boolean;
  onClose: () => void;
  /** organizationId for the campaign + the admin API's ?org= switcher param. */
  targetOrg: string;
  isMasterAdmin: boolean;
  /** Exactly one of these two must be non-empty. */
  registeredUserIds?: string[];
  contacts?: RawContactInputClient[];
  maxRecipients?: number;
  /** Optional boilerplate to prefill the message body with, e.g. a shared link. */
  defaultBody?: string;
  onSent?: (result: { sent?: number; failed?: number; recipients?: number }) => void;
};

/**
 * Generalized from AdminUsersManager.tsx's sendEmailToSelectedUsers()/modal —
 * same POST /campaigns -> send-now (master) or submit-approval (non-master)
 * sequence, parameterized to accept either registeredUserIds or raw contacts.
 */
export default function SendEmailModal({
  open,
  onClose,
  targetOrg,
  isMasterAdmin,
  registeredUserIds = [],
  contacts = [],
  maxRecipients = 500,
  defaultBody = "",
  onSent,
}: SendEmailModalProps) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recipientCount = registeredUserIds.length || contacts.length;

  if (!open) return null;

  async function send() {
    if (recipientCount === 0) return;
    if (recipientCount > maxRecipients) {
      setError(`Too many recipients (max ${maxRecipients}). Reduce your selection and try again.`);
      return;
    }
    const campaignTitle = title.trim() || `Email ${new Date().toISOString().slice(0, 10)}`;
    const messageBody = body.trim();
    if (!messageBody) {
      setError("Message body is required.");
      return;
    }
    if (isMasterAdmin) {
      const ok = window.confirm(
        `Send email to ${recipientCount} selected recipient(s) in ${targetOrg} now?\n\nSubject: ${subject.trim() || campaignTitle}\n\nThis cannot be undone.`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setError("");
    try {
      const orgQuery = `org=${targetOrg}`;
      const createRes = await fetch(`/api/admin/communications/campaigns?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: campaignTitle,
          messageSubject: subject.trim() || null,
          messageBody,
          channels: ["EMAIL"],
          organizationId: targetOrg,
          ...(registeredUserIds.length > 0
            ? { registeredUserIds }
            : { contacts }),
        }),
      });
      const createJson = (await createRes.json()) as { error?: string; data?: { id: string } };
      if (!createRes.ok || !createJson.data?.id) {
        throw new Error(createJson.error || "Failed to create campaign");
      }
      const campaignId = createJson.data.id;

      if (isMasterAdmin) {
        const sendRes = await fetch(
          `/api/admin/communications/campaigns/${campaignId}/send-now?${orgQuery}`,
          { method: "POST" },
        );
        const sendJson = (await sendRes.json()) as {
          error?: string;
          result?: { sent: number; failed: number };
        };
        if (!sendRes.ok) throw new Error(sendJson.error || "Send failed");
        onSent?.({ sent: sendJson.result?.sent, failed: sendJson.result?.failed });
      } else {
        const subRes = await fetch(
          `/api/admin/communications/campaigns/${campaignId}/submit-approval?${orgQuery}`,
          { method: "POST" },
        );
        const subJson = (await subRes.json()) as { error?: string; recipients?: number };
        if (!subRes.ok) throw new Error(subJson.error || "Submit for approval failed");
        onSent?.({ recipients: subJson.recipients ?? recipientCount });
      }

      setTitle("");
      setSubject("");
      setBody(defaultBody);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4 shadow-xl">
        <div>
          <h3 className="text-lg font-semibold">Email selected recipients</h3>
          <p className="text-sm text-zinc-400 mt-1">
            {recipientCount} recipient(s) in {targetOrg}. Creates a Communications campaign with
            an explicit audience.
            {isMasterAdmin
              ? " As Master Admin you can send immediately after create."
              : " You will submit for Board Member+ approval before send."}
          </p>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Campaign title (internal)"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Message body"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !body.trim() || recipientCount === 0}
            onClick={() => void send()}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : isMasterAdmin
                ? `Create & send now (${recipientCount})`
                : `Create & submit for approval (${recipientCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
