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

type HeroNewsRotatorProps = {
  items: RotatorItem[];
};

const ROTATE_EVERY_MS = 6000;

export default function HeroNewsRotator({ items }: HeroNewsRotatorProps) {
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

  return (
    // min-h alone does not give children a definite height, so Image fill
    // collapsed to ~0px. Give the frame an explicit min-height and pin the
    // link with absolute inset so the hero always fills the viewport band.
    <section className="relative overflow-hidden bg-black px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8">
      <div className="relative mx-auto min-h-[calc(70svh-1.5rem)] w-full max-w-420 md:min-h-[calc(75vh-3rem)]">
        <Link
          href={`/news/${activeItem.slug}`}
          className="absolute inset-0 block overflow-hidden rounded-2xl border border-zinc-800"
          aria-label={`Read news article: ${activeItem.title}`}
        >
          <Image
            src={activeItem.imageUrl}
            alt={activeItem.title}
            fill
            sizes="(max-width: 768px) 100vw, 1600px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/25" />

          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-8">
            <div className="mb-3 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] text-white sm:mb-4 sm:text-xs sm:tracking-[3px]">
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

        {items.length > 1 ? (
          <div className="absolute bottom-4 right-4 z-10 flex gap-2 md:bottom-7 md:right-7">
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
