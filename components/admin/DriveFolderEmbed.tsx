"use client";

import { useState } from "react";

type DriveFolderEmbedProps = {
  folderId: string;
};

function driveEmbedSrc(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
}

/**
 * Google Drive's embedded folder view often renders with unreadable contrast when
 * embedded from a dark-themed parent (cross-origin — we can't fix their CSS).
 * `invert` + `hue-rotate-180` approximates a light theme for the iframe pixels.
 */
export default function DriveFolderEmbed({ folderId }: DriveFolderEmbedProps) {
  const [readablePreview, setReadablePreview] = useState(true);

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={readablePreview}
          onChange={(e) => setReadablePreview(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-[#2374E1] focus:ring-[#2374E1]"
        />
        <span>
          Readable preview{" "}
          <span className="text-zinc-500 font-normal">
            (color fix for Drive embed on dark pages)
          </span>
        </span>
      </label>

      <div className="rounded-xl border border-zinc-400 bg-zinc-100 p-2 shadow-inner dark:border-zinc-500">
        <iframe
          title="Shared Google Drive folder"
          src={driveEmbedSrc(folderId)}
          className={
            readablePreview
              ? "h-[min(70vh,720px)] w-full rounded-md border-0 bg-white invert hue-rotate-180"
              : "h-[min(70vh,720px)] w-full rounded-md border-0 bg-white"
          }
        />
      </div>
    </div>
  );
}
