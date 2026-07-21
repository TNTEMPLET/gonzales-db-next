"use client";

import { useMemo, useState } from "react";

import NewsImageLightbox, {
  type NewsGalleryImage,
} from "@/components/news/NewsImageLightbox";

export default function NewsArticleGallery({
  images,
  title,
}: {
  images: NewsGalleryImage[];
  title: string;
}) {
  const items = useMemo(
    () => images.filter((image) => Boolean(image.url)),
    [images],
  );
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="mb-10" aria-label="Photo gallery">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
        Photos
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((image, index) => (
          <button
            key={image.id || `${image.url}-${index}`}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/70 text-left transition hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
          >
            <img
              src={image.url}
              alt={image.alt || image.caption || `${title} photo ${index + 1}`}
              className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.03]"
              loading="lazy"
            />
            {image.caption ? (
              <p className="line-clamp-2 px-2 py-1.5 text-[11px] text-zinc-400">
                {image.caption}
              </p>
            ) : null}
          </button>
        ))}
      </div>

      <NewsImageLightbox
        images={items}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
        onNavigate={setOpenIndex}
      />
    </section>
  );
}
