"use client";

import React from "react";

type ActionButton = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  onClick: () => void;
  disabled?: boolean;
};

export default function BulkActionToolbar({
  selectedCount,
  onClear,
  actions,
}: {
  selectedCount: number;
  onClear: () => void;
  actions: ActionButton[];
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-30 mx-auto mt-4 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md text-white">
      <div className="flex items-center gap-3">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
          {selectedCount}
        </span>
        <span className="text-sm font-medium text-zinc-200">
          {selectedCount === 1 ? "1 record selected" : `${selectedCount} records selected`}
        </span>
        <button
          onClick={onClear}
          className="text-xs font-semibold text-zinc-400 hover:text-white underline underline-offset-2 ml-2"
        >
          Deselect all
        </button>
      </div>

      <div className="flex items-center gap-2">
        {actions.map((act) => (
          <button
            key={act.key}
            onClick={act.onClick}
            disabled={act.disabled}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              act.variant === "danger"
                ? "bg-red-600/80 text-white hover:bg-red-500"
                : act.variant === "secondary"
                ? "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20"
            }`}
          >
            {act.icon}
            {act.label}
          </button>
        ))}
      </div>
    </div>
  );
}
