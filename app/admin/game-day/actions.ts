"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { endOfCentralDay } from "@/lib/admin/dashboard/gameDay";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import { loadPublicScheduleGames, loadPublicScheduleWindow } from "@/lib/schedule/publicScheduleLoad";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import prisma from "@/lib/prisma";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

export type GameDayActionResult = { ok: true } | { ok: false; error: string };

async function requireGameDayRole(organizationId: ContentOrgId): Promise<GameDayActionResult | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) return { ok: false, error: "Sign in again to update game day." };

  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, organizationId);
  if (!role || !hasAdminRoleAtLeast(role, "PARK_DIRECTOR")) {
    return { ok: false, error: "You cannot change game day for this league." };
  }
  return null;
}

async function parkNamesForOrg(organizationId: ContentOrgId): Promise<Set<string>> {
  const [parks, window] = await Promise.all([
    prisma.schedulePark.findMany({
      where: { organizationId, isActive: true },
      select: { name: true },
    }),
    loadPublicScheduleWindow(organizationId),
  ]);
  const names = new Set(parks.map((park) => park.name));
  const games = await loadPublicScheduleGames({
    org: organizationId,
    startDate: window.startDate,
    endDate: window.endDate,
  });
  const today = leagueCalendarDate();
  for (const game of games) {
    if (game.dateKey === today && game.parkName.trim()) names.add(game.parkName);
  }
  return names;
}

export async function setGameDayRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<GameDayActionResult> {
  if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
  const denied = await requireGameDayRole(input.organizationId);
  if (denied) return denied;

  const allowed = await parkNamesForOrg(input.organizationId);
  const parks = [...new Set(input.parks.map((park) => park.trim()).filter(Boolean))].filter((park) =>
    allowed.has(park),
  );
  if (!input.allParksOut && parks.length === 0) {
    return { ok: false, error: "Pick a park, or choose all parks." };
  }

  const now = new Date();
  const expiresAt = endOfCentralDay(now);
  await prisma.$transaction([
    prisma.orgAlert.deleteMany({
      where: { organizationId: input.organizationId, expiresAt: { gt: now } },
    }),
    prisma.orgAlert.create({
      data: {
        organizationId: input.organizationId,
        allParksOut: input.allParksOut,
        venues: input.allParksOut ? [] : parks,
        expiresAt,
      },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function clearGameDayRainout(organizationId: string): Promise<GameDayActionResult> {
  if (!isContentOrgId(organizationId)) return { ok: false, error: "Unknown league." };
  const denied = await requireGameDayRole(organizationId);
  if (denied) return denied;

  await prisma.orgAlert.deleteMany({
    where: { organizationId, expiresAt: { gt: new Date() } },
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}
