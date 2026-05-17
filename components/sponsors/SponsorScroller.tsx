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

function hideScrollerPath(pathname: string | null) {
  if (!pathname) return true;
  if (pathname.startsWith("/dugout")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export default function SponsorScroller() {
  const pathname = usePathname();
  const [items, setItems] = useState<SponsorScrollerItem[]>([]);
  const hidden = hideScrollerPath(pathname);

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
    if (hidden || items.length === 0) {
      document.body.classList.remove("has-sponsor-dock");
      return;
    }
    document.body.classList.add("has-sponsor-dock");
    return () => {
      document.body.classList.remove("has-sponsor-dock");
    };
  }, [hidden, items.length]);

  if (hidden) return null;
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] pb-[env(safe-area-inset-bottom,0px)]">
      <SponsorMarquee items={items} dock />
    </div>
  );
}
