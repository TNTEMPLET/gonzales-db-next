"use client";

import { marked } from "marked";
import Image from "next/image";
import { useRef, useState } from "react";
import type { BracketOrgId } from "@/lib/siteConfig";

marked.use({ gfm: true, breaks: true });

type Section = "rules" | "parking" | "field";

type Props = {
  org: BracketOrgId;
  initial: {
    rulesMarkdown: string;
    parkingMarkdown: string;
    fieldLayoutImageUrl: string | null;
  };
};

export default function ParkInfoEditorClient({ org, initial }: Props) {
  const [rules, setRules] = useState(initial.rulesMarkdown);
  const [parking, setParking] = useState(initial.parkingMarkdown);
  const [fieldImageUrl, setFieldImageUrl] = useState<string | null>(initial.fieldLayoutImageUrl);
  const [section, setSection] = useState<Section>("rules");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/park-info?org=${org}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org, rulesMarkdown: rules, parkingMarkdown: parking, fieldLayoutImageUrl: fieldImageUrl }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/park-info/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setFieldImageUrl(json.url ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  const tabs: { id: Section; label: string }[] = [
    { id: "rules", label: "Tournament Rules" },
    { id: "parking", label: "Parking Info" },
    { id: "field", label: "Field Layout" },
  ];

  const currentMarkdown = section === "rules" ? rules : parking;
  const setCurrentMarkdown = section === "rules" ? setRules : setParking;
  const previewHtml = preview && section !== "field"
    ? String(marked.parse(currentMarkdown))
    : "";
  const rulesReady = rules.trim().length > 0;
  const parkingReady = parking.trim().length > 0;
  const fieldReady = Boolean(fieldImageUrl);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Rules", ready: rulesReady },
          { label: "Parking", ready: parkingReady },
          { label: "Field map", ready: fieldReady },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border p-3 ${
              item.ready
                ? "border-emerald-700/50 bg-emerald-950/20"
                : "border-amber-700/50 bg-amber-950/20"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {item.label}
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                item.ready ? "text-emerald-200" : "text-amber-200"
              }`}
            >
              {item.ready ? "Ready" : "Needs content"}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
        These sections are public-facing for the selected tournament site. Use
        Preview before saving long updates, then check the live park info page if
        the change affects arrival instructions.
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setSection(t.id); setPreview(false); }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              section === t.id
                ? "bg-brand-purple text-white"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rules / Parking editor */}
      {section !== "field" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Markdown supported — **bold**, *italic*, - lists, [links](url)
            </p>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition"
            >
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <div
              className="min-h-[280px] rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 prose prose-invert max-w-none prose-p:text-zinc-300 prose-headings:text-white prose-a:text-yellow-400 prose-li:text-zinc-300 prose-strong:text-white"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <textarea
              rows={14}
              value={currentMarkdown}
              onChange={(e) => setCurrentMarkdown(e.target.value)}
              placeholder={
                section === "rules"
                  ? "# Tournament Rules\n\n## General\n- Rule 1\n- Rule 2\n\n## Pitching Rules\n..."
                  : "## Parking\nParking is available at...\n\n## Directions\n..."
              }
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-y min-h-[280px]"
            />
          )}
        </div>
      ) : null}

      {/* Field layout image uploader */}
      {section === "field" ? (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Upload a park map, field diagram, or any image showing field locations. PNG, JPG, WebP — max 10 MB.
          </p>
          {fieldImageUrl ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-zinc-700">
                <Image
                  src={fieldImageUrl}
                  alt="Field layout"
                  width={1200}
                  height={800}
                  className="w-full h-auto object-contain"
                  unoptimized
                />
              </div>
              <button
                type="button"
                onClick={() => setFieldImageUrl(null)}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Remove image
              </button>
            </div>
          ) : (
            <div
              className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-10 hover:border-zinc-500 transition"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleImageUpload(file);
              }}
            >
              <span className="text-3xl">🗺️</span>
              <p className="text-sm text-zinc-300">Drop image here or click to browse</p>
              <p className="text-xs text-zinc-500">PNG, JPG, WebP, GIF, SVG — max 10 MB</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImageUpload(file);
              e.target.value = "";
            }}
          />
          {uploading ? <p className="text-xs text-zinc-400">Uploading…</p> : null}
        </div>
      ) : null}

      {/* Save bar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || uploading}
          className="rounded-lg bg-brand-purple px-5 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-40 transition"
        >
          {saving ? "Saving…" : "Save all sections"}
        </button>
        {savedAt ? <span className="text-xs text-green-400">Saved at {savedAt}</span> : null}
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
