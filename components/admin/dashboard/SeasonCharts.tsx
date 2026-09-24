"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CompletenessBar, WeeklyScorePoint } from "@/lib/admin/dashboard/seasonPulse";

const tooltipStyle = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  fontSize: 12,
};

export function ScoreCompletenessChart({ rows }: { rows: CompletenessBar[] }) {
  if (rows.length === 0) {
    return <EmptyChart label="No started games to score yet." />;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 text-xs font-semibold text-zinc-400">Score completeness by age group</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="ageGroup" tick={{ fill: "#a1a1aa", fontSize: 11 }} interval={0} />
          <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} unit="%" />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, _name, item) => {
              const row = item.payload as CompletenessBar;
              return [`${value}% (${row.scored}/${row.past})`, "Scored"];
            }}
          />
          <Bar dataKey="percent" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyScoresChart({ rows }: { rows: WeeklyScorePoint[] }) {
  if (rows.length === 0) {
    return <EmptyChart label="No started games on the season card yet." />;
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-2 text-xs font-semibold text-zinc-400">
        Started games vs saved scores
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="posted" name="Started" fill="#71717a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="scored" name="Scored" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-500">
      {label}
    </div>
  );
}
