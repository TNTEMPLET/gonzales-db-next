import { NextRequest, NextResponse } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  createMerchOrderDraft,
  DraftValidationError,
  toMerchDraftPublic,
} from "@/lib/merch/orderDrafts";
import prisma from "@/lib/prisma";
import {
  getDefaultContentOrg,
  isContentOrgId,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

function resolveOrg(request: NextRequest, bodyOrg?: string | null): ContentOrgId | null {
  const param = bodyOrg ?? request.nextUrl.searchParams.get("org");
  if (param && isContentOrgId(param)) return param;
  if (isMasterDeployment()) return isContentOrgId(param) ? param : null;
  const def = getDefaultContentOrg();
  return isContentOrgId(def) ? def : null;
}

async function requireShopAdmin(request: NextRequest, org: ContentOrgId) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return { ok: false as const, status: 401, message: "Unauthorized" };
  if (adminUser.isMaster) return { ok: true as const, adminUser };
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

/** GET — list recent drafts for org (admin). */
export async function GET(request: NextRequest) {
  const org = resolveOrg(request);
  if (!org) return NextResponse.json({ error: "Invalid org" }, { status: 400 });

  const auth = await requireShopAdmin(request, org);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const status = request.nextUrl.searchParams.get("status");
  const take = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "40", 10)));

  try {
    const rows = await prisma.merchOrderDraft.findMany({
      where: {
        org,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return NextResponse.json({
      org,
      drafts: rows.map(toMerchDraftPublic),
    });
  } catch (err) {
    console.error("[admin/merch/drafts] list failed", err);
    return NextResponse.json({ error: "Failed to list drafts" }, { status: 500 });
  }
}

/** POST — admin test form creates a draft (allows closed products). */
export async function POST(request: NextRequest) {
  let body: {
    org?: string;
    productId?: string;
    playerName?: string;
    sizes?: string[];
    contactEmail?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const org = resolveOrg(request, body.org);
  if (!org) return NextResponse.json({ error: "Invalid org" }, { status: 400 });

  const auth = await requireShopAdmin(request, org);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  if (!body.productId?.trim()) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.sizes)) {
    return NextResponse.json({ error: "sizes must be an array" }, { status: 400 });
  }

  try {
    const draft = await createMerchOrderDraft({
      org,
      productId: body.productId.trim(),
      playerName: body.playerName ?? "",
      sizes: body.sizes,
      contactEmail: body.contactEmail ?? auth.adminUser.email,
      createdByUserId: auth.adminUser.id,
      createdByEmail: auth.adminUser.email,
      allowClosedProduct: true,
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof DraftValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[admin/merch/drafts] create failed", err);
    return NextResponse.json({ error: "Failed to save draft order" }, { status: 500 });
  }
}
