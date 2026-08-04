"use client";

type BulkEmailToolbarProps = {
  selectedCount: number;
  disabled?: boolean;
  onSelectPage: () => void;
  onClear: () => void;
  onOpenEmail: () => void;
  selectPageLabel?: string;
  helpText?: string;
};

/**
 * "Select page" / "Clear selection" / "Email selected (N)" row — the toolbar
 * half of the pattern already duplicated across AdminUsersManager.tsx,
 * TravelEventDetailClient.tsx, and AllStarVaultManager.tsx.
 */
export default function BulkEmailToolbar({
  selectedCount,
  disabled = false,
  onSelectPage,
  onClear,
  onOpenEmail,
  selectPageLabel = "Select page",
  helpText = "Max 500 recipients per send. Uses Communications (Resend).",
}: BulkEmailToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onSelectPage}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-60"
      >
        {selectPageLabel}
      </button>
      <button
        type="button"
        disabled={disabled || selectedCount === 0}
        onClick={onClear}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-60"
      >
        Clear selection
      </button>
      <button
        type="button"
        disabled={disabled || selectedCount === 0}
        onClick={onOpenEmail}
        className="rounded-lg border border-brand-purple bg-brand-purple/20 text-brand-purple-light px-3 py-1.5 text-xs font-semibold hover:bg-brand-purple/30 disabled:opacity-60"
      >
        Email selected ({selectedCount})
      </button>
      {helpText ? <span className="text-xs text-zinc-500">{helpText}</span> : null}
    </div>
  );
}
