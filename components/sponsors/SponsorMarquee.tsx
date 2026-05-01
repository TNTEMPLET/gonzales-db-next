"use client";

import Image from "next/image";
import { useMemo } from "react";

export type SponsorScrollerItem = {
  sponsorId: string;
  businessName: string;
  logoUrl: string;
  logoAlt: string;
  websiteUrl: string | null;
  sortOrder: number;
};

export function SponsorMarquee({ items }: { items: SponsorScrollerItem[] }) {
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
