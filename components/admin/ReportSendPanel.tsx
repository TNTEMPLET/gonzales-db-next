"use client";

import { useEffect, useMemo, useState } from "react";

import { parseReportEmails } from "@/lib/admin/parseReportEmails";

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

function emailsStorageKey(kind: string, org: string) {
  return `ap-report-emails:${kind}:${org}`;
}

function downloadBase64(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportSendPanel({
  kind,
  org,
  startDate,
  endDate,
  league,
  requireRange = false,
}: {
  kind: "parish-field-prep" | "parish-enrollment" | "umpire-pay";
  org: string;
  startDate?: string;
  endDate?: string;
  league?: string;
  requireRange?: boolean;
}) {
  const [emails, setEmails] = useState("");
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    pdfBase64?: string;
    filename?: string;
    csvBase64?: string;
    csvFilename?: string;
    files?: { filename: string; pdfBase64: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const parsed = parseReportEmails(emails);
  const rangeReady = !requireRange;

  const pdfs = useMemo(
    () =>
      preview?.files?.length
        ? preview.files
        : preview?.pdfBase64 && preview.filename
          ? [{ filename: preview.filename, pdfBase64: preview.pdfBase64 }]
          : [],
    [preview],
  );

  const [pdfUrls, setPdfUrls] = useState<{ filename: string; url: string }[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(emailsStorageKey(kind, org));
      if (saved) setEmails(saved);
    } catch {
      /* ignore quota / private mode */
    }
  }, [kind, org]);

  useEffect(() => {
    const next = pdfs.map((file) => {
      const binary = atob(file.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return {
        filename: file.filename,
        url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
      };
    });
    setPdfUrls(next);
    return () => next.forEach((file) => URL.revokeObjectURL(file.url));
  }, [pdfs]);

  async function loadPreview() {
    if (!rangeReady) {
      setPreview(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ kind, org });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (league) params.set("league", league);
      const response = await fetch(`/api/admin/reports/preview?${params.toString()}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to preview report"));
      setPreview(json);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Failed to preview report");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, org, startDate, endDate, league, rangeReady]);

  async function send() {
    if (!parsed.emails.length || !rangeReady) return;
    const confirmed = window.confirm(`Email this AP Baseball report to ${parsed.emails.join(", ")}?`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/reports/send?org=${encodeURIComponent(org)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, org, emails, startDate, endDate, league }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to send report"));
      const sent = Number(json.sent) || 0;
      setNotice(`Sent to ${sent} recipient${sent === 1 ? "" : "s"}${json.skipped ? ` · ${json.skipped} skipped` : ""}`);
      try {
        window.localStorage.setItem(emailsStorageKey(kind, org), emails);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!rangeReady ? (
        <p className="text-sm text-amber-200">
          Generate the umpire report date range first, then you can preview and email it.
        </p>
      ) : null}
      {notice ? <p className="text-sm text-emerald-200">{notice}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {preview ? (
        <div>
          <p className="text-sm font-medium text-zinc-200">{preview.subject}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Review the AP Baseball PDF below. Nothing is emailed until you confirm.
          </p>
        </div>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Recipient emails
        </span>
        <textarea
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          rows={3}
          placeholder="parish@example.com, treasurer@example.com"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !parsed.emails.length || !rangeReady || !preview}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          Email report
        </button>
        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={busy || !rangeReady}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Refresh preview
        </button>
        {preview?.csvBase64 && preview.csvFilename ? (
          <button
            type="button"
            onClick={() => downloadBase64(preview.csvFilename!, preview.csvBase64!, "text/csv")}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Download CSV
          </button>
        ) : null}
      </div>
      {pdfUrls.map((file) => (
        <div key={file.filename} className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between gap-3 bg-zinc-950 px-3 py-2">
            <p className="text-xs font-semibold text-zinc-400">{file.filename}</p>
            <a
              href={file.url}
              download={file.filename}
              className="text-xs font-semibold text-red-300 hover:text-red-200"
            >
              Download PDF
            </a>
          </div>
          <iframe title={file.filename} src={file.url} className="h-[70vh] w-full bg-white" />
        </div>
      ))}
    </div>
  );
}
