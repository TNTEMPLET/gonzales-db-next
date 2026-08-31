"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngagementSummary } from "@/lib/admin/dashboard/engagementSummary";

export default function EngagementSection({ summary }: { summary: EngagementSummary }) {
  const trendData = summary.weeklyTrend.map((p) => ({
    week: new Date(p.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Posts: p.posts,
    Comments: p.comments,
  }));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
      <h3 className="text-base font-bold text-white flex items-center gap-2">
        <span>💬</span> Community Engagement (Dugout, last 30 days)
      </h3>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Posts</div>
          <div className="mt-1 text-2xl font-black text-white">{summary.totalPosts30d}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Comments</div>
          <div className="mt-1 text-2xl font-black text-white">{summary.totalComments30d}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Likes</div>
          <div className="mt-1 text-2xl font-black text-white">{summary.totalLikes30d}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {trendData.length > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-xs font-semibold text-zinc-400">Weekly Activity</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }} />
                <Line type="monotone" dataKey="Posts" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Comments" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-400">Top Contributors</div>
          {summary.topContributors.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No Dugout activity in the last 30 days.</div>
          ) : (
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {summary.topContributors.slice(0, 8).map((c, idx) => (
                <div
                  key={c.registeredUserId}
                  className="flex items-center justify-between rounded-lg bg-zinc-900/80 px-2.5 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-2 text-zinc-200">
                    <span className="font-mono text-zinc-500">#{idx + 1}</span>
                    {c.name}
                  </span>
                  <span className="font-semibold text-emerald-400">
                    {c.total} ({c.posts}p / {c.comments}c)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
