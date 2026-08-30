"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { EnrollmentKpiSummary } from "@/lib/enrollment/kpi";
import type { ContentOrgId } from "@/lib/siteConfig";

export type EnrollmentKpiTab = "overview" | "revenue" | "rosters" | "comparison";

const TAB_META: Record<EnrollmentKpiTab, { label: string; description: string }> = {
  overview: {
    label: "Overview",
    description: "Registration counts and top-level revenue snapshot for the season.",
  },
  revenue: {
    label: "Revenue",
    description: "Fee-tier breakdown and the net amount due after processing/online fees.",
  },
  rosters: {
    label: "Rosters",
    description: "Enrolled vs. rostered players by division.",
  },
  comparison: {
    label: "Season Comparison",
    description: "This season vs. last season's enrollment and revenue.",
  },
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
      <div className="text-xs font-medium text-zinc-400">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

export default function EnrollmentKpiHub({
  targetOrg,
  onGoToImport,
  onGoToRosterDivision,
}: {
  targetOrg: ContentOrgId;
  /** Cross-link into the sibling Import tab (both now live inside Competition & Play). */
  onGoToImport?: () => void;
  /** Cross-link into Teams & Rosters, pre-filtered to one division. */
  onGoToRosterDivision?: (division: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Nested inside Competition Hub's own "tab" param (tab=enrollment), so this
  // hub's own sub-navigation uses a second query key to avoid colliding with it.
  const tab = useMemo(() => {
    const fromUrl = searchParams.get("subtab") as EnrollmentKpiTab;
    if (fromUrl && TAB_META[fromUrl]) return fromUrl;
    return "overview" as EnrollmentKpiTab;
  }, [searchParams]);

  const setTab = useCallback(
    (next: EnrollmentKpiTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "enrollment");
      params.set("subtab", next);
      params.set("org", targetOrg);
      router.push(`/admin/competition?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  const [data, setData] = useState<EnrollmentKpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/enrollment/kpi?org=${targetOrg}`, { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to load enrollment KPIs"));
      }
      setData((json.data as EnrollmentKpiSummary) ?? null);
    } catch (err) {
      setData(null);
      setLoadError(err instanceof Error ? err.message : "Failed to load enrollment KPIs");
    } finally {
      setLoading(false);
    }
  }, [targetOrg]);

  useEffect(() => {
    function load() {
      void fetchData();
    }
    load();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Enrollment KPI Sections">
          {(Object.keys(TAB_META) as EnrollmentKpiTab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {TAB_META[t].label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">{TAB_META[tab].description}</p>
          <div className="flex items-center gap-2">
            {onGoToImport ? (
              <button
                type="button"
                onClick={onGoToImport}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                ← Import Registration Data
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void fetchData()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center space-x-3 text-zinc-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-sm font-medium">Loading enrollment data…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-6 text-rose-200">
            <p className="text-sm font-semibold">Could not load enrollment KPIs</p>
            <p className="mt-1 text-xs text-rose-300/80">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="mt-3 rounded-lg border border-rose-700 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/40"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && data && (
          <>
            {tab === "overview" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <StatTile label="Total Enrollments" value={String(data.totalEnrollments)} tone="text-emerald-400" />
                <StatTile label="Gross Registered" value={formatCents(data.grossCents)} tone="text-blue-400" />
                <StatTile label="Collected" value={formatCents(data.collectedCents)} tone="text-purple-400" />
                <StatTile label="Outstanding Balance" value={formatCents(data.outstandingCents)} tone="text-amber-400" />
                {data.unassignedEnrollments > 0 && (
                  <div className="sm:col-span-4 rounded-lg border border-zinc-800 bg-zinc-800/20 px-4 py-2 text-xs text-zinc-400">
                    {data.unassignedEnrollments} of {data.totalEnrollments} registered players are not yet
                    assigned to a team.
                  </div>
                )}
              </div>
            )}

            {tab === "revenue" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <StatTile label="Collected" value={formatCents(data.collectedCents)} tone="text-purple-400" />
                  <StatTile label="CC Processing Fee" value={`-${formatCents(data.ccProcessingFeeCents)}`} tone="text-rose-400" />
                  <StatTile label="Online Fee" value={`-${formatCents(data.onlineFeeCents)}`} tone="text-rose-400" />
                  <StatTile label="Net Due" value={formatCents(data.netDueCents)} tone="text-emerald-400" />
                </div>
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-zinc-700 bg-zinc-800/80 font-semibold uppercase tracking-wider text-zinc-300">
                      <tr>
                        <th className="px-4 py-3">Fee Tier</th>
                        <th className="px-4 py-3 text-center">Players</th>
                        <th className="px-4 py-3 text-right">Gross</th>
                        <th className="px-4 py-3 text-right">Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-medium">
                      {data.feeTierBreakdown.map((tier) => (
                        <tr key={tier.orderDetailDescription} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-semibold text-zinc-100">{tier.orderDetailDescription}</td>
                          <td className="px-4 py-3 text-center text-zinc-300">{tier.count}</td>
                          <td className="px-4 py-3 text-right text-blue-300">{formatCents(tier.grossCents)}</td>
                          <td className="px-4 py-3 text-right text-purple-300">{formatCents(tier.collectedCents)}</td>
                        </tr>
                      ))}
                      {data.feeTierBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                            No enrollment data yet for this season.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-zinc-500">
                  CC processing fee ({(data.ccProcessingFeeCents / Math.max(1, data.collectedCents) * 100 || 0).toFixed(1)}
                  % of collected) and online fee are estimated from fixed rates — see lib/enrollment/feeConstants.ts.
                </p>
              </div>
            )}

            {tab === "rosters" && (
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-700 bg-zinc-800/80 font-semibold uppercase tracking-wider text-zinc-300">
                    <tr>
                      <th className="px-4 py-3">Division</th>
                      <th className="px-4 py-3 text-center">Enrolled</th>
                      <th className="px-4 py-3 text-center">Rostered</th>
                      <th className="px-4 py-3 text-center">Unrostered</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      {onGoToRosterDivision ? <th className="px-4 py-3" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-medium">
                    {data.perDivision.map((div) => (
                      <tr key={div.ageGroup} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 font-semibold text-zinc-100">{div.ageGroup}</td>
                        <td className="px-4 py-3 text-center text-zinc-300">{div.enrolled}</td>
                        <td className="px-4 py-3 text-center text-emerald-300">{div.rostered}</td>
                        <td className="px-4 py-3 text-center text-amber-300">{div.unrostered}</td>
                        <td className="px-4 py-3 text-right text-blue-300">{formatCents(div.grossCents)}</td>
                        {onGoToRosterDivision ? (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onGoToRosterDivision(div.ageGroup)}
                              className="text-xs font-semibold text-brand-purple hover:underline"
                            >
                              Go to roster →
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    {data.perDivision.length === 0 && (
                      <tr>
                        <td colSpan={onGoToRosterDivision ? 6 : 5} className="px-4 py-6 text-center text-zinc-500">
                          No enrollment data yet for this season.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "comparison" && (
              <div className="space-y-4">
                {data.priorSeasonComparison ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
                      <div className="text-xs font-medium text-zinc-400">{data.seasonYear} Enrollments</div>
                      <div className="mt-1 text-2xl font-black text-emerald-400">{data.totalEnrollments}</div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {data.priorSeasonComparison.seasonYear}: {data.priorSeasonComparison.totalEnrollments}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
                      <div className="text-xs font-medium text-zinc-400">{data.seasonYear} Gross Registered</div>
                      <div className="mt-1 text-2xl font-black text-blue-400">{formatCents(data.grossCents)}</div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {data.priorSeasonComparison.seasonYear}: {formatCents(data.priorSeasonComparison.grossCents)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No prior-season enrollment data yet — comparison will populate once a previous
                    season has been imported through this pipeline.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
