import "server-only";

import prisma from "@/lib/prisma";
import type { MerchProduct } from "@/lib/merch/types";

export type MerchStatusOverride = {
  productId: string;
  enabled: boolean;
  activeFrom: Date | null;
  activeTo: Date | null;
  updatedAt: Date;
  updatedByAdminId: string | null;
};

/** Whether a product is open for orders right now (catalog + DB + schedule). */
export function isMerchProductOpenNow(
  product: Pick<MerchProduct, "active" | "enabled" | "activeFrom" | "activeTo">,
  now: Date = new Date(),
): boolean {
  if (!product.active) return false;
  if (product.enabled === false) return false;
  if (product.activeFrom) {
    const from = new Date(product.activeFrom);
    if (!Number.isNaN(from.getTime()) && from > now) return false;
  }
  if (product.activeTo) {
    const to = new Date(product.activeTo);
    if (!Number.isNaN(to.getTime()) && to < now) return false;
  }
  return true;
}

export async function loadMerchStatusOverrides(
  productIds?: string[],
): Promise<Map<string, MerchStatusOverride>> {
  const map = new Map<string, MerchStatusOverride>();
  try {
    const rows = await prisma.merchProductStatus.findMany({
      where: productIds?.length ? { productId: { in: productIds } } : undefined,
      select: {
        productId: true,
        enabled: true,
        activeFrom: true,
        activeTo: true,
        updatedAt: true,
        updatedByAdminId: true,
      },
    });
    for (const row of rows) {
      map.set(row.productId, row);
    }
  } catch {
    // Table may not exist yet on a lagging deploy — treat as all open.
  }
  return map;
}

export function applyMerchStatusOverride(
  product: MerchProduct,
  override: MerchStatusOverride | undefined,
): MerchProduct {
  if (!override) {
    return {
      ...product,
      enabled: product.enabled !== false,
      activeFrom: product.activeFrom ?? null,
      activeTo: product.activeTo ?? null,
    };
  }
  return {
    ...product,
    enabled: override.enabled,
    activeFrom: override.activeFrom ? override.activeFrom.toISOString() : null,
    activeTo: override.activeTo ? override.activeTo.toISOString() : null,
  };
}

export async function upsertMerchProductStatus(input: {
  productId: string;
  enabled: boolean;
  activeFrom?: Date | null;
  activeTo?: Date | null;
  adminId?: string | null;
}): Promise<MerchStatusOverride> {
  const row = await prisma.merchProductStatus.upsert({
    where: { productId: input.productId },
    create: {
      productId: input.productId,
      enabled: input.enabled,
      activeFrom: input.activeFrom ?? null,
      activeTo: input.activeTo ?? null,
      updatedByAdminId: input.adminId ?? null,
    },
    update: {
      enabled: input.enabled,
      ...(input.activeFrom !== undefined ? { activeFrom: input.activeFrom } : {}),
      ...(input.activeTo !== undefined ? { activeTo: input.activeTo } : {}),
      updatedByAdminId: input.adminId ?? null,
    },
    select: {
      productId: true,
      enabled: true,
      activeFrom: true,
      activeTo: true,
      updatedAt: true,
      updatedByAdminId: true,
    },
  });
  return row;
}
