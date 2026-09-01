"use client";

import { useEffect, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

type SubItem = {
  label: string;
  status: "COMPLETE" | "INCOMPLETE";
  href: string;
};

type ChecklistItem = {
  key: string;
  label: string;
  status: "COMPLETE" | "INCOMPLETE" | "PARTIAL";
  progressLabel?: string;
  href: string;
  manual: boolean;
  subItems?: SubItem[];
};

type Props = {
  targetOrg: ContentOrgId;
};

const statusStyles: Record<ChecklistItem["status"], string> = {
  COMPLETE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PARTIAL: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  INCOMPLETE: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const statusLabels: Record<ChecklistItem["status"], string> = {
  COMPLETE: "Complete",
  PARTIAL: "In progress",
  INCOMPLETE: "Not started",
};

export default function AdminSeasonSetupChecklist({ targetOrg }: Props) {
  const [seasonYear, setSeasonYear] = useState(() => getSeasonConfigForOrg(targetOrg).year);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchChecklist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/season-setup?org=${targetOrg}&seasonYear=${seasonYear}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load checklist");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load checklist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, seasonYear]);

  const toggleManual = async (itemKey: string, ageGroup: string | undefined, next: boolean) => {
    setSavingKey(`${itemKey}|${ageGroup ?? ""}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/season-setup?org=${targetOrg}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonYear, itemKey, ageGroup, isComplete: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update item");
      await fetchChecklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update item");
    } finally {
      setSavingKey(null);
    }
  };

  const completeCount = items.filter((i) => i.status === "COMPLETE").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-zinc-300">Season Year</label>
          <input
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(parseInt(e.target.value, 10) || seasonYear)}
            className="w-24 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
          />
        </div>
        {!loading && items.length > 0 && (
          <span className="text-sm font-semibold text-zinc-300">
            {completeCount}/{items.length} steps complete
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">
            Loading checklist...
          </div>
        ) : (
          items.map((item) => {
            const isExpanded = expandedKey === item.key;
            const savingThis = savingKey === `${item.key}|`;
            return (
              <div
                key={item.key}
                className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.manual && !item.subItems ? (
                      <input
                        type="checkbox"
                        checked={item.status === "COMPLETE"}
                        disabled={savingThis}
                        onChange={(e) => toggleManual(item.key, undefined, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-zinc-700 bg-zinc-900"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <a
                        href={`${item.href}?org=${targetOrg}`}
                        className="font-semibold text-white hover:text-emerald-400 truncate"
                      >
                        {item.label}
                      </a>
                      {item.progressLabel && (
                        <div className="text-[11px] text-zinc-500">{item.progressLabel}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusStyles[item.status]}`}
                    >
                      {statusLabels[item.status]}
                    </span>
                    {item.subItems && (
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : item.key)}
                        className="rounded-lg bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      >
                        {isExpanded ? "Hide divisions" : "Show divisions"}
                      </button>
                    )}
                  </div>
                </div>

                {item.subItems && isExpanded && (
                  <div className="mt-3 grid gap-1.5 border-t border-zinc-800 pt-3 sm:grid-cols-2">
                    {item.subItems.map((sub) => {
                      const savingSub = savingKey === `${item.key}|${sub.label}`;
                      return (
                        <div
                          key={sub.label}
                          className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {item.manual ? (
                              <input
                                type="checkbox"
                                checked={sub.status === "COMPLETE"}
                                disabled={savingSub}
                                onChange={(e) => toggleManual(item.key, sub.label, e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950"
                              />
                            ) : null}
                            <a href={`${sub.href}?org=${targetOrg}`} className="text-zinc-300 hover:text-emerald-400">
                              {sub.label}
                            </a>
                          </div>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              sub.status === "COMPLETE"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-zinc-800 text-zinc-500"
                            }`}
                          >
                            {sub.status === "COMPLETE" ? "Done" : "Open"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
