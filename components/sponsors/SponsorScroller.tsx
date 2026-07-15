"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  SponsorMarquee,
  type SponsorScrollerItem,
} from "@/components/sponsors/SponsorMarquee";

type ApiResponse = {
  data: SponsorScrollerItem[];
  error?: string;
};

type SponsorScrollerProps = {
  placement?: "dock" | "after-footer";
};

/** Footer marquee stays off until enough real sponsors are ready. */
const MIN_SPONSORS_TO_SHOW = 20;

function hideScrollerPath(pathname: string | null) {
  if (!pathname) return true;
  if (pathname.startsWith("/dugout")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/tournament-rosters")) return true;
  return false;
}

export default function SponsorScroller({
  placement = "dock",
}: SponsorScrollerProps) {
  const pathname = usePathname();
  const [items, setItems] = useState<SponsorScrollerItem[]>([]);
  const hidden = hideScrollerPath(pathname);
  const dock = placement === "dock";
  const ready = items.length >= MIN_SPONSORS_TO_SHOW;

  useEffect(() => {
    let active = true;
    async function load() {
      if (hideScrollerPath(pathname)) {
        if (active) setItems([]);
        return;
      }
      try {
        const currentOrg = new URLSearchParams(window.location.search).get("org");
        const query = currentOrg ? `?org=${encodeURIComponent(currentOrg)}` : "";
        const response = await fetch(`/api/sponsors/scroller${query}`, {
          cache: "no-store",
        });
        const json = (await response.json()) as ApiResponse;
        if (!response.ok || !active) return;
        setItems(json.data || []);
      } catch {
        if (!active) return;
        setItems([]);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!dock || hidden || !ready) {
      document.body.classList.remove("has-sponsor-dock");
      return;
    }
    document.body.classList.add("has-sponsor-dock");
    return () => {
      document.body.classList.remove("has-sponsor-dock");
    };
  }, [dock, hidden, ready]);

  if (hidden) return null;
  if (!ready) return null;

  if (!dock) {
    return <SponsorMarquee items={items} />;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] pb-safe">
      <SponsorMarquee items={items} dock />
    </div>
  );
}
