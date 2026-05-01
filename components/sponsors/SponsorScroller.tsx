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

export default function SponsorScroller() {
  const pathname = usePathname();
  const [items, setItems] = useState<SponsorScrollerItem[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
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

  return <SponsorMarquee items={items} />;
}
