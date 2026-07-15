"use client";

import type {
  ColumnDetectResult,
  RosterQualitySummary,
  SportsConnectMappingPresetView,
} from "@/lib/sportsConnect/types";

type SportsConnectQualityPanelProps = {
  quality: RosterQualitySummary | null;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
};

export function SportsConnectQualityPanel({
  quality,
  loading = false,
  error = "",
  onRefresh,
}: SportsConnectQualityPanelProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            SportsConnect roster quality
          </p>
          <p className="text-xs text-zinc-400">
            After export → import, check guardian contact and Player Card readiness for the selected
            site and season.
          </p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh quality"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-amber-300">{error}</p>
      ) : null}
      {!quality && !error ? (
        <p className="text-xs text-zinc-500">
          {loading ? "Loading roster quality…" : "Quality summary not loaded yet."}
        </p>
      ) : null}
      {quality ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QualityStat
            label="Players"
            value={String(quality.playerCount)}
            hint={`${quality.teamCount} teams`}
          />
          <QualityStat
            label="Missing guardian email"
            value={String(quality.playersMissingGuardianEmail)}
            hint="Needed for parent Player Cards"
            warn={quality.playersMissingGuardianEmail > 0}
          />
          <QualityStat
            label="Player Cards ready"
            value={`${quality.playersReady}`}
            hint={`${quality.playersIncomplete} incomplete · ${quality.playersBlocked} blocked`}
          />
          <QualityStat
            label="Teams without coaches"
            value={String(quality.teamsWithoutCoaches)}
            hint={`${quality.teamsWithoutPlayers} with no players`}
            warn={quality.teamsWithoutCoaches > 0 || quality.teamsWithoutPlayers > 0}
          />
        </div>
      ) : null}
      {quality ? (
        <p className="text-[11px] text-zinc-500">
          Last player import:{" "}
          {quality.lastPlayerImportAt
            ? new Date(quality.lastPlayerImportAt).toLocaleString()
            : "none"}
          {" · "}
          Last coach import:{" "}
          {quality.lastCoachImportAt
            ? new Date(quality.lastCoachImportAt).toLocaleString()
            : "none"}
        </p>
      ) : null}
    </div>
  );
}

function QualityStat({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${warn ? "text-amber-300" : "text-zinc-100"}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

type SportsConnectPresetBarProps = {
  presets: SportsConnectMappingPresetView[];
  selectedPresetId: string;
  presetName: string;
  busy?: boolean;
  notice?: string;
  error?: string;
  onSelectPresetId: (id: string) => void;
  onPresetNameChange: (name: string) => void;
  onApplyPreset: () => void;
  onSavePreset: () => void;
};

export function SportsConnectPresetBar({
  presets,
  selectedPresetId,
  presetName,
  busy = false,
  notice = "",
  error = "",
  onSelectPresetId,
  onPresetNameChange,
  onApplyPreset,
  onSavePreset,
}: SportsConnectPresetBarProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-200">SportsConnect mapping preset</p>
          <p className="text-[11px] text-zinc-500">
            Save division and team maps for this site and season so the next export is faster.
          </p>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto] items-end">
        <label className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Load preset</span>
          <select
            value={selectedPresetId}
            onChange={(event) => onSelectPresetId(event.target.value)}
            disabled={busy || presets.length === 0}
            className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm disabled:opacity-60"
          >
            <option value="">
              {presets.length === 0 ? "No saved presets yet" : "Select a preset…"}
            </option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.reportKind})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !selectedPresetId}
          onClick={onApplyPreset}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
        >
          Apply
        </button>
        <label className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Save as name</span>
          <input
            value={presetName}
            onChange={(event) => onPresetNameChange(event.target.value)}
            placeholder="Default"
            disabled={busy}
            className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={onSavePreset}
          className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save preset"}
        </button>
      </div>
      {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

type SportsConnectDetectionBannerProps = {
  detection: ColumnDetectResult | null;
};

export function SportsConnectDetectionBanner({ detection }: SportsConnectDetectionBannerProps) {
  if (!detection) return null;
  const tone =
    detection.reportKind === "PLAYER_REG"
      ? "border-emerald-800/80 bg-emerald-950/20 text-emerald-200"
      : detection.reportKind
        ? "border-amber-800/80 bg-amber-950/20 text-amber-100"
        : "border-zinc-700 bg-zinc-900/50 text-zinc-300";
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-1 ${tone}`}>
      <p className="font-semibold">{detection.message}</p>
      {detection.missingRequiredGroups.length > 0 ? (
        <p>
          Missing required column groups:{" "}
          {detection.missingRequiredGroups.map((group) => group[0] || "column").join("; ")}
        </p>
      ) : null}
      {detection.matchedHeaders.length > 0 ? (
        <p className="text-[11px] opacity-80">
          Matched headers: {detection.matchedHeaders.slice(0, 12).join(", ")}
          {detection.matchedHeaders.length > 12 ? "…" : ""}
        </p>
      ) : null}
    </div>
  );
}
