import type { ContentOrgId, OrgId } from "@/lib/siteConfig";
import { isContentOrgId } from "@/lib/siteConfig";
import { isSafePayPalUrl } from "@/lib/merch/paypal";
import type { MerchCatalogMeta, MerchProduct } from "@/lib/merch/types";

/**
 * League merch catalog (v1) — config-driven, PayPal NCP checkout links.
 *
 * Orders land in admin shirt-orders / cap-orders via PayPal sync + webhooks.
 * Add products here; no cart or inventory in v1.
 */
export const MERCH_CATALOG_META: MerchCatalogMeta = {
  introByOrg: {
    gonzales:
      "Members-only Gonzales Diamond Baseball gear for players and families. Checkout is handled securely by PayPal — pick your sizes and player name on the PayPal page.",
    ascension:
      "Members-only Ascension Little League gear for players and families. Checkout is handled securely by PayPal.",
    fallball:
      "Members-only AP Fall Ball merch when available. Checkout is handled securely by PayPal.",
  },
};

/**
 * Active and upcoming SKUs.
 * - Gonzales 11U State Champs — PayPal NCP Z5HW3TUQFBYWE @ $15
 * - Ascension 7-8U State Champs — PayPal NCP CFDJ5F97YVCF8 @ $15
 * - Ascension 10U State Champs — PayPal NCP CFQP6QBDF7C7N @ $15
 * - Ascension 11U State Champs — PayPal NCP 4XAXPZ9YN4FDA @ $15
 * - Ascension 12U State Champs — PayPal NCP EGP9BSTMFNYCW @ $15
 */
export const MERCH_PRODUCTS: MerchProduct[] = [
  {
    id: "gonzales-11u-state-champs-shirt-2026",
    orgs: ["gonzales"],
    name: "Gonzales 11U DYB — State Champs Shirt",
    summary: "Celebrate the 11U State Championship with the official team shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/Z5HW3TUQFBYWE",
    imageUrl: "/images/merch-gonzales-11u-shirt.png",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 10,
  },
  {
    id: "ascension-7-8u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "7–8U AP LL — State Champs Shirt",
    summary: "Celebrate the 7–8U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/CFDJ5F97YVCF8",
    imageUrl: "/images/merch-ascension-7-8u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 10,
  },
  {
    id: "ascension-10u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "10U AP LL — State Champs Shirt",
    summary: "Celebrate the 10U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/CFQP6QBDF7C7N",
    imageUrl: "/images/merch-ascension-10u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 20,
  },
  {
    id: "ascension-11u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "11U AP LL — State Champs Shirt",
    summary: "Celebrate the 11U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/4XAXPZ9YN4FDA",
    imageUrl: "/images/merch-ascension-11u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 30,
  },
  {
    id: "ascension-12u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "12U AP LL — State Champs Shirt",
    summary: "Celebrate the 12U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/EGP9BSTMFNYCW",
    imageUrl: "/images/merch-ascension-12u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 40,
  },
];

export function resolveMerchOrg(
  org: OrgId | ContentOrgId | string | null | undefined,
): ContentOrgId | null {
  if (!org) return null;
  if (isContentOrgId(org)) return org;
  return null;
}

export function listMerchProductsForOrg(
  org: OrgId | ContentOrgId | string | null | undefined,
  opts?: { includeInactive?: boolean },
): MerchProduct[] {
  const contentOrg = resolveMerchOrg(org);
  if (!contentOrg) return [];

  return MERCH_PRODUCTS.filter((p) => {
    if (!p.orgs.includes(contentOrg)) return false;
    if (!opts?.includeInactive && !p.active) return false;
    if (!isSafePayPalUrl(p.paypalUrl)) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function orgHasMerchShop(
  org: OrgId | ContentOrgId | string | null | undefined,
): boolean {
  return listMerchProductsForOrg(org).length > 0;
}

export function getMerchShopIntro(org: ContentOrgId): string {
  return (
    MERCH_CATALOG_META.introByOrg?.[org] ??
    "Official league merchandise. Secure checkout via PayPal."
  );
}

export function fulfillmentDeskPath(desk: MerchProduct["fulfillment"]): string | null {
  if (desk === "shirt-orders") return "/admin/shirt-orders";
  if (desk === "cap-orders") return "/admin/cap-orders";
  return null;
}
