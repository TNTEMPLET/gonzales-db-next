"use client";

import { useState } from "react";

export default function CopyCardsButton({ text }: { text: string }) {
  const [label, setLabel] = useState("Copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setLabel("Copied");
    } catch {
      setLabel("Copy failed");
    }
    window.setTimeout(() => setLabel("Copy"), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="min-h-12 flex-1 rounded-xl border border-neutral-400 bg-white px-4 text-base font-semibold text-neutral-950"
    >
      {label}
    </button>
  );
}
