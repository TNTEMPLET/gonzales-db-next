import { redirect } from "next/navigation";

const TAB_TO_PATH: Record<string, string> = {
  caps: "/admin/cap-orders",
  shirts: "/admin/shirt-orders",
  sponsors: "/admin/sponsors",
  reports: "/admin/reports",
};

export default async function LegacyOrdersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const tabValue = resolvedParams.tab;
  const tab = typeof tabValue === "string" ? tabValue : "caps";
  const basePath = TAB_TO_PATH[tab] || TAB_TO_PATH.caps;

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
