import { NextRequest, NextResponse } from "next/server";

import {
  createMerchOrderDraft,
  DraftValidationError,
  toMerchDraftPublic,
} from "@/lib/merch/orderDrafts";
import { getShopAccess } from "@/lib/merch/shopAccess";
import prisma from "@/lib/prisma";
import {
  getDefaultContentOrg,
  isContentOrgId,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

function resolveOrg(bodyOrg: string | undefined): ContentOrgId | null {
  if (bodyOrg && isContentOrgId(bodyOrg)) return bodyOrg;
  if (isMasterDeployment()) return null;
  const def = getDefaultContentOrg();
  return isContentOrgId(def) ? def : null;
}

/** POST — members create a draft, then pay on PayPal with the composed note. */
export async function POST(request: NextRequest) {
  const access = await getShopAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

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

  const org = resolveOrg(body.org);
  if (!org) {
    return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  }
  if (!body.productId?.trim()) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.sizes)) {
    return NextResponse.json({ error: "sizes must be an array" }, { status: 400 });
  }

  const createdByEmail =
    access.coach?.email ?? access.admin?.email ?? body.contactEmail ?? null;
  const createdByUserId = access.coach?.id ?? access.admin?.id ?? null;

  try {
    const draft = await createMerchOrderDraft({
      org,
      productId: body.productId.trim(),
      playerName: body.playerName ?? "",
      sizes: body.sizes,
      contactEmail: body.contactEmail ?? createdByEmail,
      createdByUserId,
      createdByEmail,
      allowClosedProduct: Boolean(access.admin),
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof DraftValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[merch/drafts] create failed", err);
    return NextResponse.json({ error: "Failed to save draft order" }, { status: 500 });
  }
}

/** GET — look up own draft by code (members) for pay resume. */
export async function GET(request: NextRequest) {
  const access = await getShopAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const code = (request.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const row = await prisma.merchOrderDraft.findUnique({ where: { code } });
    if (!row) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    // Members may only read drafts they created (or admins any).
    const email = (access.coach?.email ?? access.admin?.email ?? "").toLowerCase();
    const isAdmin = Boolean(access.admin);
    const owns =
      (row.createdByEmail && row.createdByEmail.toLowerCase() === email) ||
      (row.createdByUserId &&
        (row.createdByUserId === access.coach?.id || row.createdByUserId === access.admin?.id));
    if (!isAdmin && !owns) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ draft: toMerchDraftPublic(row) });
  } catch (err) {
    console.error("[merch/drafts] get failed", err);
    return NextResponse.json({ error: "Failed to load draft" }, { status: 500 });
  }
}
