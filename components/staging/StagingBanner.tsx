"use client";

import { useSelectedLayoutSegment } from "next/navigation";

export const STAGING_BANNER_TEXT = "STAGING: not production. Emails/SMS only to allowlist.";

export function StagingBanner() {
  return (
    <div
      role="status"
      className="bg-amber-400 px-3 py-1 text-center text-xs font-bold tracking-wide text-zinc-950"
    >
      {STAGING_BANNER_TEXT}
    </div>
  );
}

/** Public pages only. Admin layout renders its own copy so the bar stays inside the console. */
export function RootStagingBanner({ enabled }: { enabled: boolean }) {
  const segment = useSelectedLayoutSegment();
  if (!enabled || segment === "admin") return null;
  return <StagingBanner />;
}
