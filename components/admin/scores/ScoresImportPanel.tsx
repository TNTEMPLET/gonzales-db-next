"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { assignrScopeToQueryParam, type AdminAssignrScope } from "@/lib/admin/assignrScopeShared";

type PreviewResponse = {
  error?: string;
  rowCount?: number;
  summary?: {
    processed: number;
    matched: number;
    unmatched: number;
    skippedMissingScore: number;
    skippedRainedOut: number;
  };
  unmatchedRows?: Array<{
    rowNumber: number;
    homeTeam: string;
    awayTeam: string;
    date: string;
    reason?: string;
  }>;
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function ScoresImportPanel({ scope }: { scope: AdminAssignrScope }) {
  const router = useRouter();
  const orgQuery = assignrScopeToQueryParam(scope);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function formDataFor(fileValue: File) {
    const formData = new FormData();
    formData.set("file", fileValue);
    return formData;
  }

  async function runPreview() {
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/scores/import/preview?${orgQuery}`, {
        method: "POST",
        body: formDataFor(file),
      });
      const json = (await readJson(res)) as PreviewResponse;
      if (!res.ok) throw new Error(String(json.error || "Failed to preview scores import"));
      setPreview(json);
      setNotice(
        `Matched ${json.summary?.matched ?? 0} of ${json.summary?.processed ?? 0} rows.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview scores import");
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/scores/import?${orgQuery}`, {
        method: "POST",
        body: formDataFor(file),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to import scores"));
      setNotice(`Saved ${json.summary?.saved ?? 0} scores.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import scores");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">File import</p>
        <h2 className="mt-1 text-2xl font-bold">Upload a scores spreadsheet</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Rows match this season&apos;s posted local schedule by match id or home/away/date.
        </p>
      </div>

      {(notice || error) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-500/40 bg-red-950/40 text-red-100"
              : "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/admin/scores/template"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-brand-gold"
        >
          Download template
        </a>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
          }}
          className="text-sm text-zinc-300"
        />
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={!file || busy === "preview"}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-brand-gold disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => void runImport()}
          disabled={!file || busy === "import"}
          className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50"
        >
          Import scores
        </button>
      </div>

      {preview?.summary ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Processed" value={preview.summary.processed} />
          <Stat label="Matched" value={preview.summary.matched} />
          <Stat label="Unmatched" value={preview.summary.unmatched} />
          <Stat label="Missing scores" value={preview.summary.skippedMissingScore} />
        </div>
      ) : null}

      {preview?.unmatchedRows && preview.unmatchedRows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                <th className="px-3 py-2 text-left">Match</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {preview.unmatchedRows.slice(0, 25).map((row) => (
                <tr key={row.rowNumber} className="border-t border-zinc-800">
                  <td className="px-3 py-2">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    {row.homeTeam} vs {row.awayTeam}
                  </td>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.reason || "Unmatched"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
