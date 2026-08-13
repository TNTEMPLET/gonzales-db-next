"use client";

import { useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";

export type RecipientTarget = {
  email: string;
  name?: string | null;
  userId?: string | null;
};

export type RawContactInputClient = {
  email: string;
  name?: string | null;
};

type SendEmailModalProps = {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  recipients?: RecipientTarget[];
  registeredUserIds?: string[];
  contacts?: RawContactInputClient[];
  targetOrg: string;
  isMasterAdmin?: boolean;
  defaultBody?: string;
  maxRecipients?: number;
  onSent?: (result: { sent?: number; failed?: number; recipients?: number }) => void;
};

export default function SendEmailModal({
  isOpen,
  open,
  onClose,
  recipients = [],
  registeredUserIds = [],
  contacts = [],
  targetOrg,
  isMasterAdmin = false,
  defaultBody = "",
  maxRecipients,
  onSent,
}: SendEmailModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(defaultBody || "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showModal = isOpen ?? open ?? false;
  if (!showModal) return null;

  const validRecipients = recipients.filter((r) => r.email && r.email.includes("@"));
  const explicitCount = registeredUserIds.length || contacts.length || validRecipients.length;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setStatus({ type: "error", message: "Subject and message body are required." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const userIds = registeredUserIds.length > 0
        ? registeredUserIds
        : (validRecipients.map((r) => r.userId).filter(Boolean) as string[]);
      const rawEmails = contacts.length > 0
        ? contacts.map((c) => c.email)
        : validRecipients.filter((r) => !r.userId).map((r) => r.email);

      const isAllSitesOrg = targetOrg === "all";
      const orgQuery = isAllSitesOrg ? "" : `org=${targetOrg}`;

      const res = await fetch(`/api/admin/communications/campaigns${orgQuery ? `?${orgQuery}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: isAllSitesOrg ? null : targetOrg,
          title: subject,
          subject,
          htmlBody: `<div style="font-family: sans-serif; line-height: 1.6;">${body.replace(/\n/g, "<br/>")}</div>`,
          plainTextBody: body,
          registeredUserIds: userIds,
          rawEmails: rawEmails,
          audienceRule: "EXPLICIT_USERS",
          sendNow: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create email campaign.");
      }

      onSent?.({ sent: explicitCount });

      setStatus({
        type: "success",
        message: `Email campaign queued successfully for ${explicitCount} recipients!`,
      });

      setTimeout(() => {
        setSubject("");
        setBody("");
        setStatus(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "An error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl text-white space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-tight">Broadcast Email Campaign</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Sending to <span className="font-semibold text-white">{explicitCount} recipients</span> via Communications module.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {status && (
          <div
            className={`rounded-xl border p-3 text-sm font-medium ${
              status.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {status.message}
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Season Update & Field Readiness"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-red-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Message Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Type your message to families and coaches here..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-red-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || explicitCount === 0}
              className="rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
            >
              {loading ? "Sending..." : `Send to ${explicitCount} Recipient(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
