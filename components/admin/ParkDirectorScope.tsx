"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { parkDirectorParkKey } from "@/lib/admin/parkDirectorPark";
import type { ContentOrgId } from "@/lib/siteConfig";

export default function ParkDirectorScope({
  org,
  parks,
  day,
  selectedPark,
}: {
  org: ContentOrgId;
  parks: string[];
  day: string;
  selectedPark: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (selectedPark || parks.length === 0) return;
    const stored = window.sessionStorage.getItem(parkDirectorParkKey(org));
    if (!stored || !parks.includes(stored)) return;
    router.replace(deskHref(org, day, stored));
  }, [day, org, parks, router, selectedPark]);

  function choosePark(park: string | null) {
    if (park) window.sessionStorage.setItem(parkDirectorParkKey(org), park);
    else window.sessionStorage.removeItem(parkDirectorParkKey(org));
    router.push(deskHref(org, day, park));
  }

  function chooseDay(nextDay: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDay)) return;
    router.push(deskHref(org, nextDay, selectedPark));
  }

  return (
    <div className="mb-8 space-y-4" data-park-director-scope="true">
      <label className="block max-w-xs text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Day
        <input
          type="date"
          value={day}
          onChange={(event) => chooseDay(event.target.value)}
          className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white"
        />
      </label>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Working at</p>
        <div className="flex flex-wrap gap-2">
          {parks.map((park) => (
            <button
              key={park}
              type="button"
              aria-pressed={selectedPark === park}
              onClick={() => choosePark(selectedPark === park ? null : park)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                selectedPark === park
                  ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {park}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function deskHref(org: ContentOrgId, day: string, park: string | null) {
  const params = new URLSearchParams({ org, day });
  if (park) params.set("park", park);
  return `/admin?${params.toString()}#umpire-pay`;
}
