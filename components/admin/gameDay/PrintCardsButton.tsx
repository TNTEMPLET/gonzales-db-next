"use client";

export default function PrintCardsButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-12 flex-1 rounded-xl bg-neutral-950 px-4 text-base font-semibold text-white"
    >
      Print
    </button>
  );
}
