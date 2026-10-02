"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { rainoutActionError } from "@/lib/rainout/actionError";
import { setOrgRainout } from "@/lib/rainout/apply";
import { previewRainoutNotifications } from "@/lib/rainout/notify";
import { revalidateRainoutPaths } from "@/lib/rainout/revalidate";
import type { RainoutNotifySummary } from "@/lib/rainout/types";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

export type AlertActionResult =
  | { ok: true; summary?: RainoutNotifySummary }
  | { ok: false; error: string };

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

function rainoutFields(formData: FormData): {
  org: string;
  allParksOut: boolean;
  parks: string[];
  expiresAtRaw: string;
} {
  const org = String(formData.get("org") ?? "");
  const allParksOut = formData.get("allParksOut") === "true";
  const venuesRaw = String(formData.get("venues") ?? "");
  const parks = venuesRaw
    .split("\n")
    .map((venue) => venue.trim())
    .filter(Boolean);
  return { org, allParksOut, parks, expiresAtRaw: String(formData.get("expiresAt") ?? "") };
}

export async function previewOrgAlert(formData: FormData): Promise<AlertActionResult> {
  try {
    const { org, allParksOut, parks } = rainoutFields(formData);
    if (!CONTENT_ORGS.includes(org as ContentOrgId)) {
      return { ok: false, error: "Invalid org" };
    }
    await requireParkAlertsAccess(org as ContentOrgId);
    const preview = await previewRainoutNotifications({ organizationId: org, allParksOut, parks });
    if (!preview.ok) return preview;
    return { ok: true, summary: preview.summary };
  } catch (error: unknown) {
    return { ok: false, error: rainoutActionError(error, "Could not preview rainout emails.") };
  }
}

export async function createOrgAlert(formData: FormData): Promise<AlertActionResult> {
  try {
    const { org, allParksOut, parks, expiresAtRaw } = rainoutFields(formData);

    if (!CONTENT_ORGS.includes(org as ContentOrgId)) {
      return { ok: false, error: "Invalid org" };
    }
    const adminUser = await requireParkAlertsAccess(org as ContentOrgId);

    const expiresAt = new Date(expiresAtRaw);
    if (Number.isNaN(expiresAt.getTime())) return { ok: false, error: "Invalid expiry date" };

    const result = await setOrgRainout({
      organizationId: org,
      allParksOut,
      parks,
      expiresAt,
      actorAdminId: adminUser.id,
    });
    if (!result.ok) return result;
    return { ok: true, summary: result.summary };
  } catch (error: unknown) {
    return { ok: false, error: rainoutActionError(error, "Rainout update failed.") };
  }
}

export async function deleteOrgAlert(alertId: string) {
  const alert = await prisma.orgAlert.findUnique({ where: { id: alertId } });
  if (!alert) return;

  await requireParkAlertsAccess(alert.organizationId as ContentOrgId);

  await prisma.orgAlert.delete({ where: { id: alertId } });
  revalidateRainoutPaths();
}

export async function extendOrgAlert(alertId: string, newExpiresAt: Date) {
  const alert = await prisma.orgAlert.findUnique({ where: { id: alertId } });
  if (!alert) return;

  await requireParkAlertsAccess(alert.organizationId as ContentOrgId);

  await prisma.orgAlert.update({
    where: { id: alertId },
    data: { expiresAt: newExpiresAt },
  });

  revalidateRainoutPaths();
}
