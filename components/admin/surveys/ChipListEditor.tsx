"use client";

import { useState } from "react";

type ChipListEditorProps = {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
};

export default function ChipListEditor({ values, onChange, placeholder, disabled }: ChipListEditorProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const next = draft.trim();
    if (!next || disabled) return;
    if (values.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200"
          >
            {value}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="text-zinc-500 hover:text-white disabled:opacity-40"
              aria-label={`Remove ${value}`}
            >
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-[11px] text-zinc-500">None yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || !draft.trim()}
          onClick={add}
          className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
