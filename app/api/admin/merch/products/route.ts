import { NextRequest, NextResponse } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  getMerchProductById,
  listMerchProductsForOrgAsync,
  resolveMerchOrg,
} from "@/lib/merch/catalog";
import {
  isMerchProductOpenNow,
  upsertMerchProductStatus,
} from "@/lib/merch/productStatus";
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
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, adminUser };
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

  const product = getMerchProductById(productId);
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
    console.error("[merch/products] upsert failed", err);
    return NextResponse.json(
      { error: "Failed to update product status" },
      { status: 500 },
    );
  }
}
