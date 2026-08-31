import { redirect } from "next/navigation";

const TAB_TO_PATH: Record<string, string> = {
  comms: "/admin/communications",
  news: "/admin/news",
  social: "/admin/social",
  dugout: "/admin/dugout",
  drive: "/admin/documents",
};

export default async function LegacyPublishingRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const tabValue = resolvedParams.tab;
  const tab = typeof tabValue === "string" ? tabValue : "comms";
  const basePath = TAB_TO_PATH[tab] || TAB_TO_PATH.comms;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (key === "tab") continue;
    if (value && typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `${basePath}?${query}` : basePath);
}
