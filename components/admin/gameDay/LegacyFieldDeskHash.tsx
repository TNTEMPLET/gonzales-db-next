"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { gameDayHrefForLegacyHash } from "@/lib/admin/gameDay/tabs";

/** Old field-desk bookmarks keep #controllers, #cards, or #where across the server redirect. */
export default function LegacyFieldDeskHash() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const href = gameDayHrefForLegacyHash({
      search: params.toString(),
      hash: window.location.hash,
    });
    if (href) router.replace(href);
  }, [params, router]);

  return null;
}
