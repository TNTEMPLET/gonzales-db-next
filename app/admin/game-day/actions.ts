"use server";

import { cookies } from "next/headers";

import { endOfCentralDay } from "@/lib/admin/dashboard/gameDay";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { rainoutActionError } from "@/lib/rainout/actionError";
import { clearOrgRainout, setOrgRainout } from "@/lib/rainout/apply";
import { previewRainoutNotifications } from "@/lib/rainout/notify";
import type { RainoutNotifySummary } from "@/lib/rainout/types";
import { decideRainoutWrite, type RainoutActor } from "@/lib/rainout/writeAccess";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

export type GameDayActionResult =
  | { ok: true; summary?: RainoutNotifySummary }
  | { ok: false; error: string };

async function requireGameDayRole(
  organizationId: ContentOrgId,
): Promise<
  | { ok: true; adminId: string; actor: RainoutActor; role: AdminRole }
  | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) return { ok: false, error: "Sign in again to update game day." };

  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, organizationId);
  if (!role || !canAccessAdminModule(role, "GAME_DAY")) {
    return { ok: false, error: "You cannot change game day for this league." };
  }
  return {
    ok: true,
    adminId: adminUser.id,
    role,
    actor: { isMaster: adminUser.isMaster, role },
  };
}

async function requireRainoutWriter(organizationId: ContentOrgId) {
  const auth = await requireGameDayRole(organizationId);
  if (!auth.ok) return auth;
  const decision = decideRainoutWrite({ ...auth.actor, path: "game-day" });
  if (!decision.allowed) return { ok: false as const, error: decision.message };
  return auth;
}

export async function previewGameDayRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<GameDayActionResult> {
  try {
    if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
    const auth = await requireGameDayRole(input.organizationId);
    if (!auth.ok) return auth;
    const preview = await previewRainoutNotifications(input);
    if (!preview.ok) return preview;
    return { ok: true, summary: preview.summary };
  } catch (error: unknown) {
    return { ok: false, error: rainoutActionError(error, "Could not preview rainout emails.") };
  }
}

export async function setGameDayRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<GameDayActionResult> {
  try {
    if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
    const auth = await requireRainoutWriter(input.organizationId);
    if (!auth.ok) return auth;

    const result = await setOrgRainout({
      organizationId: input.organizationId,
      allParksOut: input.allParksOut,
      parks: input.parks,
      expiresAt: endOfCentralDay(new Date()),
      actorAdminId: auth.adminId,
      actor: auth.actor,
      path: "game-day",
    });
    if (!result.ok) return result;
    return { ok: true, summary: result.summary };
  } catch (error: unknown) {
    return { ok: false, error: rainoutActionError(error, "Rainout update failed.") };
  }
}

export async function clearGameDayRainout(organizationId: string): Promise<GameDayActionResult> {
  try {
    if (!isContentOrgId(organizationId)) return { ok: false, error: "Unknown league." };
    const auth = await requireRainoutWriter(organizationId);
    if (!auth.ok) return auth;
    return clearOrgRainout({
      organizationId,
      actor: auth.actor,
      path: "game-day",
    });
  } catch (error: unknown) {
    return { ok: false, error: rainoutActionError(error, "Could not clear the rainout.") };
  }
}
