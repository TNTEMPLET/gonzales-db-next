"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

async function requireParkAlertsAccess(targetOrg: ContentOrgId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) redirect("/admin/login?next=/admin/alerts");

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    targetOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "PARK_ALERTS")) {
    redirect("/admin?denied=park-alerts");
  }
  return adminUser;
}

export async function createOrgAlert(formData: FormData) {
  const org = formData.get("org") as string;
  const allParksOut = formData.get("allParksOut") === "true";
  const venuesRaw = (formData.get("venues") as string | null) ?? "";
  const expiresAtRaw = formData.get("expiresAt") as string;

  if (!CONTENT_ORGS.includes(org as ContentOrgId)) {
    throw new Error("Invalid org");
  }
  await requireParkAlertsAccess(org as ContentOrgId);

  const venues = venuesRaw
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);

  const expiresAt = new Date(expiresAtRaw);
  if (isNaN(expiresAt.getTime())) throw new Error("Invalid expiry date");

  await prisma.orgAlert.create({
    data: {
      organizationId: org,
      allParksOut,
      venues: allParksOut ? [] : venues,
      expiresAt,
    },
  });

  revalidatePath("/admin/alerts");
  revalidatePath("/");
}

export async function deleteOrgAlert(alertId: string) {
  const alert = await prisma.orgAlert.findUnique({ where: { id: alertId } });
  if (!alert) return;

  await requireParkAlertsAccess(alert.organizationId as ContentOrgId);

  await prisma.orgAlert.delete({ where: { id: alertId } });

  revalidatePath("/admin/alerts");
  revalidatePath("/");
}

export async function extendOrgAlert(alertId: string, newExpiresAt: Date) {
  const alert = await prisma.orgAlert.findUnique({ where: { id: alertId } });
  if (!alert) return;

  await requireParkAlertsAccess(alert.organizationId as ContentOrgId);

  await prisma.orgAlert.update({
    where: { id: alertId },
    data: { expiresAt: newExpiresAt },
  });

  revalidatePath("/admin/alerts");
  revalidatePath("/");
}
