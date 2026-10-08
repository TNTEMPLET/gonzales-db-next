import { redirect } from "next/navigation";

import { fieldDeskRedirectHref } from "@/lib/admin/gameDay/tabs";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Field desk | ${site.name}`,
    description: "Field desk now opens in Game Day.",
  };
}

export default async function FieldDeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(fieldDeskRedirectHref(await searchParams));
}
