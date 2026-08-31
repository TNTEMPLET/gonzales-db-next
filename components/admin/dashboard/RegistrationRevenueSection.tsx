"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RegistrationSummary } from "@/lib/admin/dashboard/registrationSummary";

const ORG_LABELS: Record<string, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
  fallball: "Fall Ball",
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

export default function RegistrationRevenueSection({ summary }: { summary: RegistrationSummary }) {
  const orgChartData = summary.byOrg.map((o) => ({
    org: ORG_LABELS[o.organizationId] ?? o.organizationId,
    Registered: o.totalEnrollments,
    "Collected ($)": Math.round(o.collectedCents / 100),
  }));

  const trendData = summary.weeklyTrend.map((p) => ({
    week: new Date(p.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    Registrations: p.registrations,
  }));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
      <h3 className="text-base font-bold text-white flex items-center gap-2">
        <span>📈</span> Registration & Revenue
      </h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total Registered" value={summary.totalEnrollments.toLocaleString()} />
        <StatTile label="Collected" value={formatCents(summary.collectedCents)} />
        <StatTile label="Outstanding" value={formatCents(summary.outstandingCents)} />
        <StatTile label="Gross" value={formatCents(summary.grossCents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {orgChartData.length > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-xs font-semibold text-zinc-400">Registrations by Org</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={orgChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="org" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }} />
                <Bar dataKey="Registered" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {trendData.length > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-xs font-semibold text-zinc-400">Weekly Registration Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }} />
                <Area type="monotone" dataKey="Registrations" stroke="#10b981" fill="#10b98133" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
