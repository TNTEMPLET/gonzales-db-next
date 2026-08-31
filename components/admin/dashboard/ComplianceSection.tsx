"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ComplianceSummary } from "@/lib/admin/dashboard/complianceSummary";
import { READINESS_LABELS, type VolunteerReadiness } from "@/lib/volunteers/types";

const READINESS_COLORS: Record<VolunteerReadiness, string> = {
  READY: "#10b981",
  INCOMPLETE: "#f59e0b",
  EXPIRED: "#f97316",
  BLOCKED: "#ef4444",
};

export default function ComplianceSection({ summary }: { summary: ComplianceSummary }) {
  const pieData = (Object.keys(summary.readiness) as VolunteerReadiness[])
    .map((key) => ({ name: READINESS_LABELS[key], key, value: summary.readiness[key] }))
    .filter((d) => d.value > 0);

  const divisionsWithData = summary.rosterFillByDivision.filter((d) => d.enrolled > 0);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
      <h3 className="text-base font-bold text-white flex items-center gap-2">
        <span>🛡️</span> Volunteer Compliance & Rosters
      </h3>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400">Coach/Volunteer Readiness</span>
            <span className="font-black text-emerald-400">{summary.readyPercent}% Ready</span>
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {pieData.map((d) => (
                    <Cell key={d.key} fill={READINESS_COLORS[d.key]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-10 text-center text-xs text-zinc-500">No active volunteer profiles yet.</div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {pieData.map((d) => (
              <span key={d.key} className="flex items-center gap-1.5 text-zinc-400">
                <span className="h-2 w-2 rounded-full" style={{ background: READINESS_COLORS[d.key] }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-400">Roster Fill by Division</div>
          {divisionsWithData.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">No enrollment data yet.</div>
          ) : (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {divisionsWithData.map((d) => {
                const pct = d.enrolled > 0 ? Math.round((d.rostered / d.enrolled) * 100) : 0;
                return (
                  <div key={`${d.organizationId}-${d.ageGroup}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>
                        {d.ageGroup} <span className="text-zinc-600">({d.organizationId})</span>
                      </span>
                      <span className="font-semibold text-zinc-300">
                        {d.rostered} / {d.enrolled} rostered
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
