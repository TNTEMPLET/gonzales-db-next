"use server";

import { cookies } from "next/headers";

import { endOfCentralDay } from "@/lib/admin/dashboard/gameDay";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { clearOrgRainout, setOrgRainout } from "@/lib/rainout/apply";
import { previewRainoutNotifications } from "@/lib/rainout/notify";
import type { RainoutNotifySummary } from "@/lib/rainout/types";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

export type GameDayActionResult =
  | { ok: true; summary?: RainoutNotifySummary }
  | { ok: false; error: string };

async function requireGameDayRole(
  organizationId: ContentOrgId,
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) return { ok: false, error: "Sign in again to update game day." };

  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, organizationId);
  if (!role || !hasAdminRoleAtLeast(role, "PARK_DIRECTOR")) {
    return { ok: false, error: "You cannot change game day for this league." };
  }
  return { ok: true, adminId: adminUser.id };
}

export async function previewGameDayRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<GameDayActionResult> {
  if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
  const auth = await requireGameDayRole(input.organizationId);
  if (!auth.ok) return auth;
  const preview = await previewRainoutNotifications(input);
  if (!preview.ok) return preview;
  return { ok: true, summary: preview.summary };
}

export async function setGameDayRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<GameDayActionResult> {
  if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
  const auth = await requireGameDayRole(input.organizationId);
  if (!auth.ok) return auth;

  const result = await setOrgRainout({
    organizationId: input.organizationId,
    allParksOut: input.allParksOut,
    parks: input.parks,
    expiresAt: endOfCentralDay(new Date()),
    actorAdminId: auth.adminId,
  });
  if (!result.ok) return result;
  return { ok: true, summary: result.summary };
}

export async function clearGameDayRainout(organizationId: string): Promise<GameDayActionResult> {
  if (!isContentOrgId(organizationId)) return { ok: false, error: "Unknown league." };
  const auth = await requireGameDayRole(organizationId);
  if (!auth.ok) return auth;
  return clearOrgRainout(organizationId);
}
