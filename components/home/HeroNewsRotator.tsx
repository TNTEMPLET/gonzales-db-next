"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type RotatorItem = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string;
  excerpt: string | null;
};

export type HeroRotatorCta = {
  label: string;
  href: string;
  /** primary = purple, secondary = gold, outline = white border */
  variant?: "primary" | "secondary" | "outline";
  external?: boolean;
};

export type HeroRotatorCtaStrip = {
  /** Short status under title, e.g. "Registration Open" / "Opens August 1" */
  statusLabel: string;
  statusTone?: "open" | "pending" | "closed";
  /** Optional heading; defaults to "Registration" when omitted */
  title?: string;
  actions: HeroRotatorCta[];
};

type HeroNewsRotatorProps = {
  items: RotatorItem[];
  /** Optional action strip so CTAs stay visible when news owns the hero. */
  ctaStrip?: HeroRotatorCtaStrip | null;
};

const ROTATE_EVERY_MS = 6000;

function statusToneClass(tone: HeroRotatorCtaStrip["statusTone"]) {
  if (tone === "open") return "text-emerald-400";
  if (tone === "closed") return "text-zinc-400";
  return "text-brand-gold";
}

function ctaClass(variant: HeroRotatorCta["variant"] = "primary") {
  const base =
    "inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 sm:min-h-12 sm:px-6 sm:text-base";
  if (variant === "secondary") {
    return `${base} bg-brand-gold text-zinc-950 hover:bg-brand-gold/90`;
  }
  if (variant === "outline") {
    return `${base} border-2 border-white text-white hover:bg-white hover:text-black`;
  }
  return `${base} bg-brand-purple text-white hover:bg-brand-purple-dark`;
}

export default function HeroNewsRotator({
  items,
  ctaStrip = null,
}: HeroNewsRotatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, ROTATE_EVERY_MS);

    return () => window.clearInterval(timer);
  }, [items.length]);

  const activeItem = items[activeIndex];
  if (!activeItem) return null;

  const hasCtaStrip = Boolean(ctaStrip && ctaStrip.actions.length > 0);

  return (
    // min-h alone does not give children a definite height, so Image fill
    // collapsed to ~0px. Give the frame an explicit min-height and pin layers
    // so the hero always fills the viewport band.
    <section className="relative overflow-hidden bg-black px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8">
      <div className="relative mx-auto min-h-[calc(70svh-1.5rem)] w-full max-w-420 md:min-h-[calc(75vh-3rem)]">
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-zinc-800">
          <Image
            src={activeItem.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1600px"
            className="object-cover"
            priority
            aria-hidden
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/45 to-black/25" />

          {/* News story content (click-through) */}
          <Link
            href={`/news/${activeItem.slug}`}
            className={`absolute inset-x-0 top-0 z-[1] block p-4 sm:p-6 md:p-8 ${
              hasCtaStrip ? "bottom-36 sm:bottom-40 md:bottom-44" : "bottom-0"
            }`}
            aria-label={`Read news article: ${activeItem.title}`}
          >
            <div className="flex h-full flex-col justify-end">
              <div className="mb-3 inline-block w-fit rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] text-white sm:mb-4 sm:text-xs sm:tracking-[3px]">
                FEATURED NEWS
              </div>
              <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-5xl">
                {activeItem.title}
              </h1>
              {activeItem.excerpt ? (
                <p className="mt-3 line-clamp-3 max-w-2xl text-sm text-zinc-200 sm:text-base md:text-lg">
                  {activeItem.excerpt}
                </p>
              ) : null}
              <p className="mt-4 text-sm font-semibold text-brand-gold md:mt-5 md:text-base">
                Read Article
              </p>
            </div>
          </Link>

          {/* Hero CTA strip — outside news link so buttons work independently */}
          {hasCtaStrip && ctaStrip ? (
            <div className="absolute inset-x-0 bottom-0 z-[2] border-t border-white/10 bg-black/70 p-3 backdrop-blur-sm sm:p-4 md:p-5">
              <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                    {ctaStrip.title ?? "Registration"}
                  </p>
                  <p
                    className={`mt-0.5 text-base font-semibold sm:text-lg ${statusToneClass(
                      ctaStrip.statusTone,
                    )}`}
                  >
                    {ctaStrip.statusLabel}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  {ctaStrip.actions.map((action) => {
                    const className = ctaClass(action.variant);
                    if (action.external) {
                      return (
                        <a
                          key={`${action.href}-${action.label}`}
                          href={action.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={className}
                        >
                          {action.label}
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={`${action.href}-${action.label}`}
                        href={action.href}
                        className={className}
                      >
                        {action.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div
            className={`absolute right-4 z-10 flex gap-2 md:right-7 ${
              hasCtaStrip
                ? "bottom-[9.5rem] sm:bottom-40 md:bottom-44"
                : "bottom-4 md:bottom-7"
            }`}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 rounded-full transition-all ${
                  index === activeIndex
                    ? "w-9 bg-brand-gold"
                    : "w-2.5 bg-zinc-300/70 hover:bg-zinc-100"
                }`}
                aria-label={`Show rotator slide ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
