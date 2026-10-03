/**
 * Cap and shirt Orders switch (admin revamp slice 2a).
 *
 * Defaults off on every site. `canAccessAdminModule(..., "ORDERS")` is false
 * for every role, including Master Admin, until this is turned on.
 *
 * Turn it back on with either:
 *   - env `ORDERS_ENABLED=true` (also accepts 1, yes, on; false/0/no/off force it off), or
 *   - flip `ORDERS_ENABLED_DEFAULT` below to `true`.
 *
 * While off, this hides admin order UI, admin order APIs, and the merch shop
 * (`/shop`, `/admin/shop`, `/admin/shop/test-order`, and links to them).
 * PayPal webhooks, the shirt-orders cron, `lib/merch` ingest, and an in-flight
 * shop capture (`/api/merch/paypal/capture-order`) keep recording orders.
 */
import { isContentOrgId } from "@/lib/siteConfig";
export const ORDERS_ENABLED_DEFAULT = false;

export const ORDERS_UNAVAILABLE_MESSAGE = "Orders are not available right now";

/** Narrow env bag so tests can pass `{ ORDERS_ENABLED }` without the rest of ProcessEnv. */
export type OrdersFlagEnv = {
  ORDERS_ENABLED?: string;
};

function readOrdersEnabledEnv(env?: OrdersFlagEnv): string | undefined {
  if (env) return env.ORDERS_ENABLED;
  // Dynamic key so Next does not inline a build-time value.
  const key = "ORDERS_ENABLED";
  return process.env[key];
}

export function isOrdersModuleEnabled(env?: OrdersFlagEnv): boolean {
  const raw = readOrdersEnabledEnv(env)?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off" || raw === "") return false;
  return ORDERS_ENABLED_DEFAULT;
}

/** JSON body the admin cap/shirt order APIs return while the flag is off. */
export function ordersAdminApiDenial(env?: OrdersFlagEnv): {
  status: 403;
  message: string;
} | null {
  if (isOrdersModuleEnabled(env)) return null;
  return { status: 403, message: ORDERS_UNAVAILABLE_MESSAGE };
}

const LEGACY_OTHER_TABS: Record<string, string> = {
  sponsors: "/admin/sponsors",
  reports: "/admin/reports",
};

/**
 * Legacy `/admin/orders?tab=` target.
 * Cap and shirt tabs (including the older `cap-orders` / `shirt-orders` names)
 * show the unavailable page while the flag is off, instead of the hidden desks.
 * Sponsors and reports keep their redirects.
 */
export function legacyOrdersDestination(
  tab: string | undefined,
  env?: OrdersFlagEnv,
): { kind: "unavailable" } | { kind: "redirect"; path: string } {
  const value = tab && tab.length > 0 ? tab : "caps";
  const other = LEGACY_OTHER_TABS[value];
  if (other) return { kind: "redirect", path: other };
  if (!isOrdersModuleEnabled(env)) return { kind: "unavailable" };
  if (value === "shirts" || value === "shirt-orders") {
    return { kind: "redirect", path: "/admin/shirt-orders" };
  }
  return { kind: "redirect", path: "/admin/cap-orders" };
}

/**
 * `/shop`, `/admin/shop`, and `/admin/shop/test-order`.
 * Checked before the shop login gate so a signed-in member still sees no catalog.
 */
export function shopPageGate(env?: OrdersFlagEnv):
  | { kind: "unavailable"; message: string }
  | { kind: "open" } {
  if (isOrdersModuleEnabled(env)) return { kind: "open" };
  return { kind: "unavailable", message: ORDERS_UNAVAILABLE_MESSAGE };
}

export type HeaderShopNavItem = { href: "/shop"; label: "Shop"; key: "shop" };

/**
 * Public header Shop item. Same org rules as before (content orgs, not
 * tournament-only), plus the Orders flag. Pass `ordersEnabled` from the server
 * layout — the header is a client component and must not read `ORDERS_ENABLED`.
 */
export function headerShopNavItem(input: {
  orgId: string;
  tournamentOnly?: boolean;
  ordersEnabled?: boolean;
  env?: OrdersFlagEnv;
}): HeaderShopNavItem | null {
  const enabled =
    typeof input.ordersEnabled === "boolean"
      ? input.ordersEnabled
      : isOrdersModuleEnabled(input.env);
  if (!enabled || input.tournamentOnly) return null;
  if (!isContentOrgId(input.orgId)) return null;
  return { href: "/shop", label: "Shop", key: "shop" };
}

/** All-Star program stage ids. Shop follows the Orders flag; cap/shirt follow `showOrders`. */
export function filterAllStarProgramStageIds(
  stageIds: readonly string[],
  showOrders: boolean,
  env?: OrdersFlagEnv,
): string[] {
  const shopOpen = isOrdersModuleEnabled(env);
  return stageIds.filter((id) => {
    if (id === "cap-orders" || id === "shirt-orders") return showOrders;
    if (id === "shop") return shopOpen;
    return true;
  });
}
