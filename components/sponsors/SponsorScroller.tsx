"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type SponsorScrollerItem = {
  sponsorId: string;
  businessName: string;
  logoUrl: string;
  logoAlt: string;
  websiteUrl: string | null;
  sortOrder: number;
};

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

  const railItems = useMemo(() => [...items, ...items], [items]);
  if (items.length === 0) return null;

  return (
    <div className="sponsor-strip border-b border-zinc-800 bg-zinc-950/85">
      <div className="sponsor-strip-mask">
        <div className="sponsor-marquee-track">
          {railItems.map((entry, index) => {
            const key = `${entry.sponsorId}-${index}`;
            const logo = (
              <div className="sponsor-pill h-12 min-w-[140px] px-4">
                <Image
                  src={entry.logoUrl}
                  alt={entry.logoAlt || `${entry.businessName} logo`}
                  width={180}
                  height={48}
                  className="max-h-9 w-auto object-contain"
                />
              </div>
            );
            return (
              <div key={key} className="sponsor-marquee-item">
                {entry.websiteUrl ? (
                  <a
                    href={entry.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={entry.businessName}
                  >
                    {logo}
                  </a>
                ) : (
                  logo
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
