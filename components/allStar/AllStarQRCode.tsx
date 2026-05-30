"use client";

import { useEffect, useRef, useState } from "react";

export default function AllStarQRCode({
  url,
  label,
  size = 128,
}: {
  url: string;
  label: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const compact = size < 100;

  useEffect(() => {
    if (!url) return;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url, {
          width: Math.max(size, 80),
          margin: compact ? 1 : 1,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((du) => setDataUrl(du))
      .catch(() => setError(true));
  }, [url, size, compact]);

  if (error) return null;
  if (!dataUrl) {
    return (
      <div
        className="rounded-md bg-zinc-800 animate-pulse"
        style={{ width: size, height: size }}
        aria-label="Generating QR code…"
        suppressHydrationWarning
      />
    );
  }

  const filename = `${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-qr.png`;

  // In compact mode, render just the image with the save link positioned below
  // as a separate element so it doesn't affect vertical centering in flex rows.
  if (compact) {
    return (
      // position: relative so the absolute save link doesn't affect parent flex height
      <div className="relative" style={{ width: size, height: size }}>
        <img
          src={dataUrl}
          alt={`QR code for ${label}`}
          width={size}
          height={size}
          className="rounded border-2 border-white shadow"
        />
        <a
          href={dataUrl}
          download={filename}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap text-[10px] text-sky-500 hover:text-sky-400 transition-colors leading-none"
        >
          ↓ Save
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <img
        src={dataUrl}
        alt={`QR code for ${label}`}
        width={size}
        height={size}
        className="rounded-md border-2 border-white shadow"
      />
      <a
        href={dataUrl}
        download={filename}
        className="text-xs text-sky-400 hover:text-sky-300 transition-colors border border-sky-700/40 rounded px-2.5 py-1 hover:bg-sky-950/30"
      >
        ↓ Download QR Code
      </a>
    </div>
  );
}
