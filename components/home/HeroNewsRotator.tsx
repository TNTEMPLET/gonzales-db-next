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
    <section className="relative h-[75vh] bg-black overflow-hidden px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="relative mx-auto h-full w-full max-w-420">
        <Link
          href={`/news/${activeItem.slug}`}
          className="relative block h-full w-full rounded-2xl overflow-hidden border border-zinc-800"
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

          <div className="absolute left-0 right-0 bottom-0 p-6 md:p-8">
            <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-4 py-2 rounded-full mb-4">
              FEATURED NEWS
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight max-w-3xl">
              {activeItem.title}
            </h1>
            {activeItem.excerpt ? (
              <p className="mt-3 text-zinc-200 max-w-2xl text-base md:text-lg">
                {activeItem.excerpt}
              </p>
            ) : null}
            <p className="mt-5 text-brand-gold font-semibold text-sm md:text-base">
              Read Article
            </p>
          </div>
        </Link>

        {items.length > 1 ? (
          <div className="absolute bottom-5 right-5 md:bottom-7 md:right-7 z-10 flex gap-2">
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
