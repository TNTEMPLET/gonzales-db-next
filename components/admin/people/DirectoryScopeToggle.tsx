"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ContentOrgId } from "@/lib/siteConfig";

export default function DirectoryScopeToggle({
  targetOrg,
  directoryScope,
}: {
  targetOrg: ContentOrgId;
  directoryScope: ContentOrgId | "all";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("org", directoryScope === "all" ? targetOrg : "all");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
    >
      {directoryScope === "all" ? "Switch to single org view" : "View all sites directory"}
    </button>
  );
}
