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

export function SponsorMarquee({
  items,
  dock = false,
}: {
  items: SponsorScrollerItem[];
  /** Fixed to viewport bottom (border + shadow on top edge). */
  dock?: boolean;
}) {
  const railItems = useMemo(() => [...items, ...items], [items]);
  if (items.length === 0) return null;

  const stripClass = dock
    ? "sponsor-strip sponsor-strip--dock border-t border-zinc-800 bg-zinc-950/95 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]"
    : "sponsor-strip border-b border-zinc-800 bg-zinc-950/85";

  return (
    <div className={stripClass}>
      <div className="sponsor-strip-mask">
        <div className="sponsor-marquee-track">
          {railItems.map((entry, index) => {
            const key = `${entry.sponsorId}-${index}`;
            const logo = (
              <div className="sponsor-pill h-8 w-[116px] sm:h-9 sm:w-[148px]">
                <Image
                  src={entry.logoUrl}
                  alt={entry.logoAlt || `${entry.businessName} logo`}
                  fill
                  sizes="148px"
                  className="object-cover object-center"
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
