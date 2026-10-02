import { redirect } from "next/navigation";

import OrdersUnavailable from "@/components/admin/OrdersUnavailable";
import { legacyOrdersDestination } from "@/lib/auth/ordersModule";

export default async function LegacyOrdersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const tabValue = resolvedParams.tab;
  const tab = typeof tabValue === "string" ? tabValue : undefined;
  const destination = legacyOrdersDestination(tab);
  if (destination.kind === "unavailable") {
    return <OrdersUnavailable />;
  }
  const basePath = destination.path;

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
