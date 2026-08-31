import Link from "next/link";
import type { NeedsAttentionSummary } from "@/lib/admin/dashboard/needsAttentionSummary";

export default function NeedsAttentionPanel({ summary }: { summary: NeedsAttentionSummary }) {
  const totalOpen = summary.items.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
      <h3 className="text-base font-bold text-white flex items-center gap-2">
        <span>✅</span> Needs Attention
      </h3>

      {totalOpen === 0 ? (
        <div className="py-6 text-center text-xs text-emerald-400">Nothing needs attention right now. 🎉</div>
      ) : (
        <div className="space-y-1.5">
          {summary.items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center justify-between rounded-lg bg-zinc-950/70 px-3 py-2 text-xs hover:bg-zinc-950"
            >
              <span className="flex items-center gap-2 text-zinc-300">
                <span className={`h-2 w-2 rounded-full ${item.count > 0 ? "bg-amber-400" : "bg-zinc-700"}`} />
                {item.label}
              </span>
              <span className={`font-bold ${item.count > 0 ? "text-amber-400" : "text-zinc-600"}`}>{item.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
