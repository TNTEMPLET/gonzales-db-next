import { NextRequest, NextResponse } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  getMerchProductByIdAsync,
  listMerchProductsForOrgAsync,
  resolveMerchOrg,
  upsertMerchProductRecord,
} from "@/lib/merch/catalog";
import { isSafePayPalUrl } from "@/lib/merch/paypal";
import {
  isMerchProductOpenNow,
  upsertMerchProductStatus,
} from "@/lib/merch/productStatus";
import type { MerchFulfillmentDesk, MerchProduct } from "@/lib/merch/types";
import {
  getDefaultContentOrg,
  isContentOrgId,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

function resolveOrg(request: NextRequest, adminUser: { isMaster: boolean }): ContentOrgId | null {
  const orgParam = request.nextUrl.searchParams.get("org");
  if (isMasterDeployment() && adminUser.isMaster) {
    return isContentOrgId(orgParam) ? orgParam : getDefaultContentOrg();
  }
  if (isContentOrgId(orgParam)) return orgParam;
  return resolveMerchOrg(getDefaultContentOrg());
}

async function requireShopAdmin(request: NextRequest, org: ContentOrgId) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  if (adminUser.isMaster) {
    return { ok: true as const, adminUser };
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    org,
  );
  const role = effectiveRole ?? null;
  if (!role || !hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, adminUser };
}

function slugifyProductId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `merch-${Date.now().toString(36)}`;
}

/** GET — catalog for org with open/closed status (admin). */
export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = resolveOrg(request, adminUser);
  if (!org) {
    return NextResponse.json({ error: "Invalid org" }, { status: 400 });
  }

  const auth = await requireShopAdmin(request, org);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const products = await listMerchProductsForOrgAsync(org, { includeClosed: true });
  const now = new Date();

  return NextResponse.json({
    org,
    products: products.map((p) => ({
      ...p,
      openNow: isMerchProductOpenNow(p, now),
    })),
  });
}

/**
 * POST — create or fully update a catalog product in the DB.
 * Body: MerchProduct fields (+ optional org for auth scope).
 */
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<MerchProduct> & { org?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const paypalUrl = body.paypalUrl?.trim();
  const priceCents =
    typeof body.priceCents === "number" ? body.priceCents : Number(body.priceCents);

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!paypalUrl || !isSafePayPalUrl(paypalUrl)) {
    return NextResponse.json({ error: "Valid paypal.com checkout URL required" }, { status: 400 });
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "priceCents must be a non-negative number" }, { status: 400 });
  }

  const orgsRaw = Array.isArray(body.orgs) ? body.orgs : [];
  const orgs = orgsRaw.filter(isContentOrgId);
  if (orgs.length === 0) {
    const fallback =
      resolveMerchOrg(body.org) ??
      resolveOrg(request, adminUser);
    if (!fallback) {
      return NextResponse.json({ error: "orgs required" }, { status: 400 });
    }
    orgs.push(fallback);
  }

  const authOrg = orgs[0]!;
  const auth = await requireShopAdmin(request, authOrg);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const id =
    (body.id?.trim() || slugifyProductId(name)).slice(0, 80) ||
    `merch-${Date.now().toString(36)}`;

  const fulfillment: MerchFulfillmentDesk =
    body.fulfillment === "cap-orders" || body.fulfillment === "none"
      ? body.fulfillment
      : "shirt-orders";

  const product: MerchProduct = {
    id,
    orgs,
    name,
    summary: (body.summary ?? "").trim() || name,
    description: body.description?.trim() || undefined,
    priceCents: Math.round(priceCents),
    paypalUrl,
    imageUrl: body.imageUrl?.trim() || null,
    badge: body.badge?.trim() || null,
    checkoutHints: Array.isArray(body.checkoutHints)
      ? body.checkoutHints.filter((h): h is string => typeof h === "string")
      : [
          "Required on PayPal: player name",
          "Required on PayPal: size(s) for each shirt",
          "Up to 10 shirts per checkout",
        ],
    maxQuantity:
      typeof body.maxQuantity === "number" && body.maxQuantity > 0
        ? Math.min(50, Math.round(body.maxQuantity))
        : 10,
    fulfillment,
    active: body.active !== false,
    enabled: body.enabled !== false,
    activeFrom: body.activeFrom ?? null,
    activeTo: body.activeTo ?? null,
    sortOrder:
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.round(body.sortOrder)
        : 100,
  };

  try {
    const saved = await upsertMerchProductRecord(product, auth.adminUser.id);
    return NextResponse.json({
      product: {
        ...saved,
        openNow: isMerchProductOpenNow(saved),
      },
    });
  } catch (err) {
    console.error("[merch/products] upsert failed", err);
    return NextResponse.json({ error: "Failed to save product" }, { status: 500 });
  }
}

/**
 * PATCH — toggle open/closed (and optional schedule) for a catalog product.
 * Body: { productId, enabled, activeFrom?, activeTo?, org? }
 */
export async function PATCH(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    productId?: string;
    enabled?: boolean;
    activeFrom?: string | null;
    activeTo?: string | null;
    org?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const product = await getMerchProductByIdAsync(productId);
  if (!product) {
    return NextResponse.json({ error: "Unknown productId" }, { status: 404 });
  }

  const orgParam =
    body.org ??
    request.nextUrl.searchParams.get("org") ??
    product.orgs[0] ??
    null;
  const org = resolveMerchOrg(orgParam) ?? resolveOrg(request, adminUser);
  if (!org || !product.orgs.includes(org)) {
    return NextResponse.json(
      { error: "Product is not available for this organization" },
      { status: 400 },
    );
  }

  const auth = await requireShopAdmin(request, org);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  }

  const activeFrom = parseOptionalDate(body.activeFrom);
  const activeTo = parseOptionalDate(body.activeTo);
  if (body.activeFrom !== undefined && activeFrom === undefined && body.activeFrom !== null && body.activeFrom !== "") {
    return NextResponse.json({ error: "Invalid activeFrom" }, { status: 400 });
  }
  if (body.activeTo !== undefined && activeTo === undefined && body.activeTo !== null && body.activeTo !== "") {
    return NextResponse.json({ error: "Invalid activeTo" }, { status: 400 });
  }

  try {
    const status = await upsertMerchProductStatus({
      productId,
      enabled: body.enabled,
      activeFrom,
      activeTo,
      adminId: auth.adminUser.id,
    });

    const merged = {
      ...product,
      enabled: status.enabled,
      activeFrom: status.activeFrom ? status.activeFrom.toISOString() : null,
      activeTo: status.activeTo ? status.activeTo.toISOString() : null,
    };

    return NextResponse.json({
      product: {
        ...merged,
        openNow: isMerchProductOpenNow(merged),
      },
      status: {
        productId: status.productId,
        enabled: status.enabled,
        activeFrom: status.activeFrom ? status.activeFrom.toISOString() : null,
        activeTo: status.activeTo ? status.activeTo.toISOString() : null,
        updatedAt: status.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[merch/products] status upsert failed", err);
    return NextResponse.json(
      { error: "Failed to update product status" },
      { status: 500 },
    );
  }
}
