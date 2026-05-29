"use client";

import { useEffect, useRef, useState } from "react";

export default function AllStarQRCode({ url, label }: { url: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url, {
          width: 256,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((du) => setDataUrl(du))
      .catch(() => setError(true));
  }, [url]);

  if (error) return null;
  if (!dataUrl) {
    return (
      <div className="w-48 h-48 rounded-lg bg-zinc-800 animate-pulse" aria-label="Generating QR code…" />
    );
  }

  const filename = `${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-qr.png`;

  return (
    <div className="flex flex-col items-center gap-3">
      <img
        src={dataUrl}
        alt={`QR code for ${label}`}
        width={192}
        height={192}
        className="rounded-lg border-4 border-white shadow-lg"
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
