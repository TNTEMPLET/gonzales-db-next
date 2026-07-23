import "server-only";

import type { ContentOrgId, OrgId } from "@/lib/siteConfig";
import { isContentOrgId } from "@/lib/siteConfig";
import { MERCH_CATALOG_SEED } from "@/lib/merch/catalogSeed";
import { isSafePayPalUrl } from "@/lib/merch/paypal";
import {
  applyMerchStatusOverride,
  isMerchProductOpenNow,
  loadMerchStatusOverrides,
} from "@/lib/merch/productStatus";
import type { MerchCatalogMeta, MerchFulfillmentDesk, MerchProduct } from "@/lib/merch/types";
import prisma from "@/lib/prisma";

/**
 * League merch catalog — DB-backed (MerchProduct), seeded from catalogSeed.
 *
 * Orders land in admin shirt-orders / cap-orders via PayPal sync + webhooks.
 * Runtime open/closed lives on MerchProduct (+ legacy MerchProductStatus overlay).
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

/** @deprecated Prefer DB via listMerchProductsForOrgAsync. Seed only. */
export const MERCH_PRODUCTS: MerchProduct[] = MERCH_CATALOG_SEED;

type MerchProductRow = {
  id: string;
  orgsJson: string;
  name: string;
  summary: string;
  description: string | null;
  priceCents: number;
  paypalUrl: string;
  imageUrl: string | null;
  badge: string | null;
  checkoutHintsJson: string | null;
  maxQuantity: number | null;
  fulfillment: string;
  active: boolean;
  enabled: boolean;
  activeFrom: Date | null;
  activeTo: Date | null;
  sortOrder: number;
};

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function parseOrgs(raw: string): ContentOrgId[] {
  return parseJsonStringArray(raw).filter(isContentOrgId);
}

function parseFulfillment(raw: string): MerchFulfillmentDesk {
  if (raw === "cap-orders" || raw === "none" || raw === "shirt-orders") return raw;
  return "shirt-orders";
}

export function merchProductFromRow(row: MerchProductRow): MerchProduct {
  return {
    id: row.id,
    orgs: parseOrgs(row.orgsJson),
    name: row.name,
    summary: row.summary,
    description: row.description ?? undefined,
    priceCents: row.priceCents,
    paypalUrl: row.paypalUrl,
    imageUrl: row.imageUrl,
    badge: row.badge,
    checkoutHints: parseJsonStringArray(row.checkoutHintsJson),
    maxQuantity: row.maxQuantity,
    fulfillment: parseFulfillment(row.fulfillment),
    active: row.active,
    enabled: row.enabled,
    activeFrom: row.activeFrom ? row.activeFrom.toISOString() : null,
    activeTo: row.activeTo ? row.activeTo.toISOString() : null,
    sortOrder: row.sortOrder,
  };
}

export function merchProductToRowData(product: MerchProduct) {
  return {
    id: product.id,
    orgsJson: JSON.stringify(product.orgs),
    name: product.name,
    summary: product.summary,
    description: product.description ?? null,
    priceCents: product.priceCents,
    paypalUrl: product.paypalUrl,
    imageUrl: product.imageUrl ?? null,
    badge: product.badge ?? null,
    checkoutHintsJson: product.checkoutHints?.length
      ? JSON.stringify(product.checkoutHints)
      : null,
    maxQuantity: product.maxQuantity ?? null,
    fulfillment: product.fulfillment,
    active: product.active,
    enabled: product.enabled !== false,
    activeFrom: product.activeFrom ? new Date(product.activeFrom) : null,
    activeTo: product.activeTo ? new Date(product.activeTo) : null,
    sortOrder: product.sortOrder,
  };
}

let seedPromise: Promise<void> | null = null;

/**
 * Ensure seed SKUs exist in MerchProduct. Safe to call often — only inserts missing ids
 * (does not overwrite admin edits).
 */
export async function ensureMerchCatalogSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const existing = await prisma.merchProduct.findMany({ select: { id: true } });
        const have = new Set(existing.map((r) => r.id));
        const missing = MERCH_CATALOG_SEED.filter((p) => !have.has(p.id));
        for (const product of missing) {
          const data = merchProductToRowData(product);
          await prisma.merchProduct.create({ data });
        }
      } catch (err) {
        // Table may not exist mid-migrate — callers fall back to seed.
        console.warn("[merch/catalog] seed skipped:", err instanceof Error ? err.message : err);
        seedPromise = null;
      }
    })();
  }
  await seedPromise;
}

export function resolveMerchOrg(
  org: OrgId | ContentOrgId | string | null | undefined,
): ContentOrgId | null {
  if (!org) return null;
  if (isContentOrgId(org)) return org;
  return null;
}

/** Sync seed lookup (no DB). Prefer getMerchProductByIdAsync. */
export function getMerchProductById(productId: string): MerchProduct | null {
  return MERCH_CATALOG_SEED.find((p) => p.id === productId) ?? null;
}

export async function getMerchProductByIdAsync(
  productId: string,
): Promise<MerchProduct | null> {
  await ensureMerchCatalogSeeded();
  try {
    const row = await prisma.merchProduct.findUnique({ where: { id: productId } });
    if (!row) return getMerchProductById(productId);
    const product = merchProductFromRow(row);
    const overrides = await loadMerchStatusOverrides([productId]);
    return applyMerchStatusOverride(product, overrides.get(productId));
  } catch {
    return getMerchProductById(productId);
  }
}

/**
 * Sync filter against seed only. Prefer listMerchProductsForOrgAsync.
 */
export function listMerchProductsForOrg(
  org: OrgId | ContentOrgId | string | null | undefined,
  opts?: { includeInactive?: boolean },
): MerchProduct[] {
  const contentOrg = resolveMerchOrg(org);
  if (!contentOrg) return [];

  return MERCH_CATALOG_SEED.filter((p) => {
    if (!p.orgs.includes(contentOrg)) return false;
    if (!opts?.includeInactive && !p.active) return false;
    if (!isSafePayPalUrl(p.paypalUrl)) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Catalog for org from DB (+ legacy status overlay + open window).
 * - Public shop: omit closed / out-of-window products (default).
 * - Admin: pass `includeClosed: true` to list everything with status fields.
 */
export async function listMerchProductsForOrgAsync(
  org: OrgId | ContentOrgId | string | null | undefined,
  opts?: { includeInactive?: boolean; includeClosed?: boolean },
): Promise<MerchProduct[]> {
  const contentOrg = resolveMerchOrg(org);
  if (!contentOrg) return [];

  await ensureMerchCatalogSeeded();

  let products: MerchProduct[] = [];
  try {
    const rows = await prisma.merchProduct.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    products = rows
      .map(merchProductFromRow)
      .filter((p) => p.orgs.includes(contentOrg))
      .filter((p) => opts?.includeInactive || opts?.includeClosed || p.active)
      .filter((p) => isSafePayPalUrl(p.paypalUrl));
  } catch {
    products = listMerchProductsForOrg(org, {
      includeInactive: opts?.includeInactive ?? opts?.includeClosed,
    });
  }

  if (products.length === 0) return [];

  const overrides = await loadMerchStatusOverrides(products.map((p) => p.id));
  const now = new Date();

  return products
    .map((p) => applyMerchStatusOverride(p, overrides.get(p.id)))
    .filter((p) => {
      if (opts?.includeClosed || opts?.includeInactive) return true;
      return isMerchProductOpenNow(p, now);
    });
}

export function orgHasMerchShop(
  org: OrgId | ContentOrgId | string | null | undefined,
): boolean {
  return listMerchProductsForOrg(org).length > 0;
}

/** True when the org has at least one product currently open for orders. */
export async function orgHasOpenMerchShop(
  org: OrgId | ContentOrgId | string | null | undefined,
): Promise<boolean> {
  const products = await listMerchProductsForOrgAsync(org);
  return products.length > 0;
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

export async function upsertMerchProductRecord(
  product: MerchProduct,
  adminId?: string | null,
): Promise<MerchProduct> {
  const data = merchProductToRowData(product);
  const row = await prisma.merchProduct.upsert({
    where: { id: product.id },
    create: {
      ...data,
      updatedByAdminId: adminId ?? null,
    },
    update: {
      ...data,
      updatedByAdminId: adminId ?? null,
    },
  });
  return merchProductFromRow(row);
}
