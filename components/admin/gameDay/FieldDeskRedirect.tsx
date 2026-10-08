"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { fieldDeskHashToTab } from "@/lib/admin/gameDay/tabs";

export default function FieldDeskRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    const tab = fieldDeskHashToTab(window.location.hash);
    if (tab) next.set("tab", tab);
    const query = next.toString();
    router.replace(query ? `/admin/game-day?${query}` : "/admin/game-day");
  }, [params, router]);

  return <p className="px-4 py-10 text-center text-neutral-700">Opening Game Day…</p>;
}
