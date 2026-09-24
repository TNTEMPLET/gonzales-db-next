"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import prisma from "@/lib/prisma";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

async function requireFieldDesk(organizationId: ContentOrgId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) return "Sign in again to save controllers.";
  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, organizationId);
  if (!role || !hasAdminRoleAtLeast(role, "PARK_DIRECTOR")) {
    return "You cannot change scoreboard controllers for this league.";
  }
  return null;
}

async function postedGame(organizationId: ContentOrgId, gameId: string) {
  return prisma.scheduleDraftGame.findFirst({
    where: {
      id: gameId,
      organizationId,
      status: { in: ["LOCKED", "EXPORTED"] },
    },
    select: {
      id: true,
      fieldId: true,
      scoreboardCheckedOutAt: true,
      scoreboardCheckedInAt: true,
      scoreboardCheckoutName: true,
    },
  });
}

export async function checkOutScoreboard(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("org") || "");
  const gameId = String(formData.get("gameId") || "");
  const side = String(formData.get("side") || "");
  if (!isContentOrgId(organizationId) || (side !== "home" && side !== "away")) return;
  if (await requireFieldDesk(organizationId)) return;
  const game = await postedGame(organizationId, gameId);
  if (!game) return;

  const stillOut = game.scoreboardCheckedOutAt && !game.scoreboardCheckedInAt;
  if (!stillOut && game.fieldId) {
    const otherOut = await prisma.scheduleDraftGame.findFirst({
      where: {
        organizationId,
        fieldId: game.fieldId,
        id: { not: game.id },
        status: { in: ["LOCKED", "EXPORTED"] },
        scoreboardCheckedOutAt: { not: null },
        scoreboardCheckedInAt: null,
      },
      select: { id: true },
    });
    if (otherOut) return;
  }
  const volunteerName = String(formData.get("volunteerName") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const fullName = volunteerName.split(" ").length >= 2 ? volunteerName : "";
  if (!stillOut && !fullName) return;
  await prisma.scheduleDraftGame.update({
    where: { id: game.id },
    data: {
      scoreboardCheckoutSide: side,
      scoreboardCheckoutName: fullName || game.scoreboardCheckoutName,
      scoreboardCheckedOutAt: stillOut ? game.scoreboardCheckedOutAt : new Date(),
      scoreboardCheckedInAt: null,
    },
  });
  revalidatePath("/admin/field-desk");
}

export async function checkInScoreboard(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("org") || "");
  const gameId = String(formData.get("gameId") || "");
  if (!isContentOrgId(organizationId)) return;
  if (await requireFieldDesk(organizationId)) return;
  const game = await postedGame(organizationId, gameId);
  if (!game?.scoreboardCheckedOutAt || game.scoreboardCheckedInAt) return;

  await prisma.scheduleDraftGame.update({
    where: { id: game.id },
    data: { scoreboardCheckedInAt: new Date() },
  });
  revalidatePath("/admin/field-desk");
}

export async function undoScoreboardReturn(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("org") || "");
  const gameId = String(formData.get("gameId") || "");
  if (!isContentOrgId(organizationId)) return;
  if (await requireFieldDesk(organizationId)) return;
  const game = await postedGame(organizationId, gameId);
  if (!game?.scoreboardCheckedOutAt || !game.scoreboardCheckedInAt) return;
  if (game.fieldId) {
    const otherOut = await prisma.scheduleDraftGame.findFirst({
      where: {
        organizationId,
        fieldId: game.fieldId,
        id: { not: game.id },
        status: { in: ["LOCKED", "EXPORTED"] },
        scoreboardCheckedOutAt: { not: null },
        scoreboardCheckedInAt: null,
      },
      select: { id: true },
    });
    if (otherOut) return;
  }

  await prisma.scheduleDraftGame.update({
    where: { id: game.id },
    data: { scoreboardCheckedInAt: null },
  });
  revalidatePath("/admin/field-desk");
}
