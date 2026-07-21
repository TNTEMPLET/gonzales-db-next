"use client";

import { useCallback, useEffect, useId, useState } from "react";

export type NewsGalleryImage = {
  id?: string;
  url: string;
  alt?: string | null;
  caption?: string | null;
};

type NewsImageLightboxProps = {
  images: NewsGalleryImage[];
  openIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

export default function NewsImageLightbox({
  images,
  openIndex,
  onClose,
  onNavigate,
}: NewsImageLightboxProps) {
  const titleId = useId();
  const open = openIndex !== null && images.length > 0;
  const index =
    openIndex === null
      ? 0
      : Math.min(Math.max(openIndex, 0), Math.max(images.length - 1, 0));
  const current = images[index];

  const goPrev = useCallback(() => {
    if (images.length === 0) return;
    onNavigate((index - 1 + images.length) % images.length);
  }, [images.length, index, onNavigate]);

  const goNext = useCallback(() => {
    if (images.length === 0) return;
    onNavigate((index + 1) % images.length);
  }, [images.length, index, onNavigate]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, goPrev, goNext]);

  if (!open || !current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-6xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-300">
          <p id={titleId} className="min-w-0 truncate">
            {current.caption || current.alt || "Gallery image"}
            <span className="ml-2 text-zinc-500">
              {index + 1} / {images.length}
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {images.length > 1 ? (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous image"
              className="absolute left-0 z-10 rounded-full border border-zinc-600 bg-zinc-950/80 px-3 py-2 text-lg text-white hover:bg-zinc-800 sm:left-2"
            >
              ‹
            </button>
          ) : null}

          <img
            src={current.url}
            alt={current.alt || current.caption || "News gallery image"}
            className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
          />

          {images.length > 1 ? (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next image"
              className="absolute right-0 z-10 rounded-full border border-zinc-600 bg-zinc-950/80 px-3 py-2 text-lg text-white hover:bg-zinc-800 sm:right-2"
            >
              ›
            </button>
          ) : null}
        </div>

        {current.caption ? (
          <p className="mt-3 text-center text-sm text-zinc-300">
            {current.caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
