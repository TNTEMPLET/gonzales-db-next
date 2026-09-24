"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { parkDirectorParkKey } from "@/lib/admin/parkDirectorPark";
import type { ContentOrgId } from "@/lib/siteConfig";

const storageKey = (org: ContentOrgId) => parkDirectorParkKey(org);

export default function ParkWorkFilter({
  org,
  parks,
  selected,
}: {
  org: ContentOrgId;
  parks: string[];
  selected: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (selected || parks.length === 0) return;
    const stored = window.sessionStorage.getItem(storageKey(org));
    if (!stored || !parks.includes(stored)) return;
    const hash = window.location.hash;
    router.replace(`/admin/field-desk?org=${org}&park=${encodeURIComponent(stored)}${hash}`);
  }, [org, parks, router, selected]);

  function choose(park: string | null) {
    if (park) window.sessionStorage.setItem(storageKey(org), park);
    else window.sessionStorage.removeItem(storageKey(org));
    const hash = window.location.hash;
    const parkQuery = park ? `&park=${encodeURIComponent(park)}` : "";
    router.push(`/admin/field-desk?org=${org}${parkQuery}${hash}`);
  }

  if (parks.length === 0) return null;

  return (
    <div className="mb-8" data-park-filter="true">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Working at</p>
      <div className="flex flex-wrap gap-2">
        <ParkButton active={selected === null} onClick={() => choose(null)}>
          All parks
        </ParkButton>
        {parks.map((park) => (
          <ParkButton key={park} active={selected === park} onClick={() => choose(park)}>
            {park}
          </ParkButton>
        ))}
      </div>
    </div>
  );
}

function ParkButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
        active
          ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
