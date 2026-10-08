import { Suspense } from "react";

import FieldDeskRedirect from "@/components/admin/gameDay/FieldDeskRedirect";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Field desk | ${site.name}`,
    description: "Field desk now opens in Game Day.",
  };
}

export default function FieldDeskPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-center text-neutral-700">Opening Game Day…</p>}>
      <FieldDeskRedirect />
    </Suspense>
  );
}
