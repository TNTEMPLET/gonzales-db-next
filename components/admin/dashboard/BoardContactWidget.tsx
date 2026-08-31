import Link from "next/link";
import type { BoardContactSummary } from "@/lib/admin/dashboard/boardContactSummary";

const ORG_LABELS: Record<string, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
  fallball: "Fall Ball",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BoardContactWidget({ summary }: { summary: BoardContactSummary }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>📞</span> Board Contact Requests
        </h3>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-400">
          {summary.openCount} open
        </span>
      </div>

      {summary.recent.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-500">No open requests right now.</div>
      ) : (
        <div className="space-y-1.5">
          {summary.recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-zinc-950/70 px-3 py-2 text-xs">
              <div>
                <div className="font-semibold text-white">{r.phone || r.email || "—"}</div>
                <div className="text-[10px] text-zinc-500">
                  {ORG_LABELS[r.organizationId ?? ""] ?? r.organizationId ?? "Unknown"} · {r.surveyTitle}
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">{fmtDate(r.submittedAt)}</span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/admin/surveys?view=contacts"
        className="inline-block text-xs font-semibold text-emerald-400 hover:text-emerald-300"
      >
        View all →
      </Link>
    </div>
  );
}
