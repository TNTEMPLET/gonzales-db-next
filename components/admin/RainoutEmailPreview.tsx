import type { RainoutNotifySummary } from "@/lib/rainout/types";

function outcomeLabel(outcome: RainoutNotifySummary["families"][number]["outcome"]): string {
  if (outcome === "send") return "Will email";
  if (outcome === "dry_run") return "Dry run — would email, sending is off";
  if (outcome === "suppressed") return "Unsubscribed — will not email";
  return "Not on the allowlist — will not email";
}

export default function RainoutEmailPreview({ summary }: { summary: RainoutNotifySummary }) {
  const heading =
    summary.phase === "preview"
      ? "Preview only. Nothing has been sent."
      : summary.dryRun
        ? "Rainout saved. Emails are off, so nothing was sent."
        : summary.sent > 0
          ? `Rainout saved. Sent ${summary.sent} email${summary.sent === 1 ? "" : "s"}.`
          : "Rainout saved. No email was sent.";

  return (
    <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-200">
      <p className="font-semibold text-white">{heading}</p>
      <p className="mt-1 text-zinc-400">
        {summary.allParksOut ? "All parks" : summary.parks.join(", ") || "No parks"}
        {summary.newlyAffectedParks.length > 0
          ? ` · New for email: ${summary.newlyAffectedParks.join(", ")}`
          : " · No newly affected parks, so nobody new is emailed."}
      </p>
      {summary.allowlistActive ? (
        <p className="mt-1 text-amber-200/90">Allowlist is on. Only those addresses can receive mail.</p>
      ) : null}
      {summary.dryRun ? (
        <p className="mt-1 text-zinc-400">
          Set RAINOUT_EMAILS_ENABLED=true to send. Until then this stays a dry run.
        </p>
      ) : null}
      {summary.error ? <p className="mt-2 text-red-300">{summary.error}</p> : null}
      {summary.families.length === 0 ? (
        <p className="mt-3 text-zinc-400">No families to email for this rainout.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.families.map((family) => (
            <li key={family.email} className="rounded-lg border border-zinc-800">
              <details className="group">
                <summary className="cursor-pointer list-none px-3 py-2">
                  <span className="font-medium text-white">{family.email}</span>
                  <span className="mt-1 block text-xs text-zinc-400 sm:mt-0 sm:ml-2 sm:inline">
                    {family.mode === "all_games"
                      ? "All of their games today are rained out"
                      : "Some games cancelled, some still on"}
                    {" · "}
                    {outcomeLabel(family.outcome)}
                  </span>
                </summary>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-zinc-800 px-3 py-2 text-xs leading-5 text-zinc-300">
                  {family.text}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
