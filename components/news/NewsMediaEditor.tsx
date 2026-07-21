"use client";

import { useState, type ChangeEvent } from "react";

export type EditableNewsMedia = {
  /** Client-only key for React lists before save */
  key: string;
  url: string;
  alt: string;
  caption: string;
};

function newKey(): string {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

export function mediaFromDto(
  rows: Array<{
    id?: string;
    url: string;
    alt?: string | null;
    caption?: string | null;
  }>,
): EditableNewsMedia[] {
  return rows.map((row) => ({
    key: row.id || newKey(),
    url: row.url,
    alt: row.alt || "",
    caption: row.caption || "",
  }));
}

export function mediaToPayload(rows: EditableNewsMedia[]) {
  return rows.map((row, index) => ({
    url: row.url,
    alt: row.alt.trim() || null,
    caption: row.caption.trim() || null,
    sortOrder: index,
  }));
}

export default function NewsMediaEditor({
  items,
  onChange,
  disabled,
  onError,
  onNotice,
}: {
  items: EditableNewsMedia[];
  onChange: (next: EditableNewsMedia[]) => void;
  disabled?: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    onError("");
    try {
      const uploaded: EditableNewsMedia[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Only image files are allowed");
        }
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/news/upload", {
          method: "POST",
          body: formData,
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to upload image");
        }
        const imageUrl = String(json.data?.imageUrl || "");
        if (!imageUrl) throw new Error("Upload returned no URL");
        uploaded.push({
          key: newKey(),
          url: imageUrl,
          alt: "",
          caption: "",
        });
      }
      onChange([...items, ...uploaded]);
      onNotice(
        uploaded.length === 1
          ? "Gallery image uploaded"
          : `${uploaded.length} gallery images uploaded`,
      );
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to upload images");
    } finally {
      setBusy(false);
    }
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    onChange([
      ...items,
      { key: newKey(), url, alt: "", caption: "" },
    ]);
    setUrlDraft("");
  }

  function move(index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    onChange(next);
  }

  function update(index: number, patch: Partial<EditableNewsMedia>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-200">Article gallery</p>
          <p className="text-xs text-zinc-500">
            Extra photos shown under the article with a lightbox. Hero/rotator
            image stays separate above.
          </p>
        </div>
        <span className="text-xs text-zinc-500">{items.length} image(s)</span>
      </div>

      <input
        type="file"
        accept="image/*"
        multiple
        disabled={disabled || busy}
        onChange={(event) => void uploadFiles(event)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-200"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          placeholder="Or paste HTTPS image URL"
          value={urlDraft}
          disabled={disabled || busy}
          onChange={(event) => setUrlDraft(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={disabled || busy || !urlDraft.trim()}
          onClick={addUrl}
          className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Add URL
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">No gallery images yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 sm:grid-cols-[96px_1fr]"
            >
              <img
                src={item.url}
                alt={item.alt || `Gallery ${index + 1}`}
                className="h-24 w-full rounded-md object-cover sm:h-full sm:max-h-28"
              />
              <div className="space-y-2">
                <p className="break-all text-[11px] text-zinc-500">{item.url}</p>
                <input
                  placeholder="Alt text"
                  value={item.alt}
                  disabled={disabled || busy}
                  onChange={(event) =>
                    update(index, { alt: event.target.value })
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="Caption (optional)"
                  value={item.caption}
                  disabled={disabled || busy}
                  onChange={(event) =>
                    update(index, { caption: event.target.value })
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled || busy || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={disabled || busy || index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => remove(index)}
                    className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
