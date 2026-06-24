"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

type HealthResponse = {
  ok?: boolean;
  scope?: string;
  sampleGameCount?: number;
  error?: string;
};

export default function AdminAssignrHub({ targetOrg }: { targetOrg: ContentOrgId }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      setError("");
      try {
        const response = await fetch(`/api/admin/assignr/health?org=${targetOrg}`);
        const json = (await response.json()) as HealthResponse;
        if (!response.ok) {
          throw new Error(json.error || "Assignr health check failed");
        }
        if (!cancelled) {
          setHealth(json);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : "Assignr health check failed");
        }
      }
    }
    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, [targetOrg]);

  const targetOrgName = getOrgDisplayName(targetOrg);

  const cards = [
    {
      href: `/admin/assignr/assignments?org=${targetOrg}`,
      title: "Assignments",
      description: "Review unassigned games, clear slots, and confirm official responses.",
    },
    {
      href: `/admin/assignr/officials?org=${targetOrg}`,
      title: "Officials",
      description: "Search officials and update profile or role flags supported by Assignr.",
    },
    {
      href: `/admin/assignr/pay?org=${targetOrg}`,
      title: "Pay & statements",
      description: "Read Assignr statements for reconciliation. Payout math stays in Reports for now.",
    },
    {
      href: `/admin/scores?org=${targetOrg}`,
      title: "Bulk games import",
      description: "Publish tournament schedules or download Assignr CSV from the scores desk.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Selected site
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">{targetOrgName}</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Start with Assignments for open game slots, Officials for contact or
          role fixes, Pay & statements for reconciliation, and Bulk games import
          when a schedule needs to be prepared for Assignr. Changes in these
          areas can update the connected Assignr league for this site.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Connection</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Connected-service status for this site. If this is unavailable,
              assignment and official updates may not reach Assignr.
            </p>
          </div>
          <div className="text-sm">
            {health?.ok ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                Connected ({health.sampleGameCount ?? 0} sample games)
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-200">
                Unavailable
              </span>
            )}
          </div>
        </div>
        {health?.scope ? (
          <p className="mt-3 text-xs text-zinc-500">OAuth scope: {health.scope}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 transition hover:border-brand-gold/50 hover:bg-zinc-900"
          >
            <h3 className="text-base font-semibold text-white">{card.title}</h3>
            <p className="mt-2 text-sm text-zinc-400">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
