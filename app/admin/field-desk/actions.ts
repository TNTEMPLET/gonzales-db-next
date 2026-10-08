"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { fieldDeskAuthRole } from "@/lib/admin/gameDay/authRole";
import { rolesOnThisSite } from "@/lib/admin/gameDay/session";
import { landsOnGameDay } from "@/lib/admin/gameDay/landing";
import { parkDirectorActiveVenueIds, parkDirectorScheduleGameWriteError } from "@/lib/admin/parkDirector/enforceWrite";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import prisma from "@/lib/prisma";
import { getDefaultContentOrg, isContentOrgId, isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";

type FieldDeskAuth =
  | { ok: true; adminId: string; isMaster: boolean; role: AdminRole; roleOnGameLeague: boolean }
  | { ok: false };

async function requireFieldDesk(organizationId: ContentOrgId): Promise<FieldDeskAuth> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) return { ok: false };
  const roleOnGameOrg = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    organizationId,
  );
  if (roleOnGameOrg && canAccessAdminModule(roleOnGameOrg, "GAME_DAY")) {
    return {
      ok: true,
      adminId: adminUser.id,
      isMaster: adminUser.isMaster,
      role: roleOnGameOrg,
      roleOnGameLeague: true,
    };
  }
  let siteRole: AdminRole | null = null;
  let hasActiveAssignments = false;
  if (!adminUser.isMaster) {
    if (isMasterDeployment()) {
      const roles = await rolesOnThisSite(adminUser.id, false);
      siteRole = landsOnGameDay({ isMaster: false, rolesOnSite: roles }) ? "PARK_DIRECTOR" : null;
    } else {
      siteRole = await getEffectiveAdminRoleForOrg(adminUser.id, false, getDefaultContentOrg());
    }
    if (siteRole === "PARK_DIRECTOR") {
      const venues = await parkDirectorActiveVenueIds({
        adminUserId: adminUser.id,
        isMaster: false,
        role: "PARK_DIRECTOR",
      });
      hasActiveAssignments = venues !== "unrestricted";
    }
  }
  const role = fieldDeskAuthRole({ roleOnGameOrg, siteRole, hasActiveAssignments });
  if (!role) return { ok: false };
  return {
    ok: true,
    adminId: adminUser.id,
    isMaster: adminUser.isMaster,
    role,
    roleOnGameLeague: false,
  };
}

async function directorMayWriteGame(auth: FieldDeskAuth, gameId: string): Promise<boolean> {
  if (!auth.ok) return false;
  const error = await parkDirectorScheduleGameWriteError({
    adminUserId: auth.adminId,
    isMaster: auth.isMaster,
    role: auth.role,
    scheduleDraftGameId: gameId,
    roleOnGameLeague: auth.roleOnGameLeague,
  });
  return error == null;
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
  const auth = await requireFieldDesk(organizationId);
  if (!auth.ok) return;
  const game = await postedGame(organizationId, gameId);
  if (!game) return;
  if (!(await directorMayWriteGame(auth, game.id))) return;

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
  revalidatePath("/admin/game-day");
}

export async function checkInScoreboard(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("org") || "");
  const gameId = String(formData.get("gameId") || "");
  if (!isContentOrgId(organizationId)) return;
  const auth = await requireFieldDesk(organizationId);
  if (!auth.ok) return;
  const game = await postedGame(organizationId, gameId);
  if (!game?.scoreboardCheckedOutAt || game.scoreboardCheckedInAt) return;
  if (!(await directorMayWriteGame(auth, game.id))) return;

  await prisma.scheduleDraftGame.update({
    where: { id: game.id },
    data: { scoreboardCheckedInAt: new Date() },
  });
  revalidatePath("/admin/field-desk");
  revalidatePath("/admin/game-day");
}

export async function undoScoreboardReturn(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("org") || "");
  const gameId = String(formData.get("gameId") || "");
  if (!isContentOrgId(organizationId)) return;
  const auth = await requireFieldDesk(organizationId);
  if (!auth.ok) return;
  const game = await postedGame(organizationId, gameId);
  if (!game?.scoreboardCheckedOutAt || !game.scoreboardCheckedInAt) return;
  if (!(await directorMayWriteGame(auth, game.id))) return;
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
  revalidatePath("/admin/game-day");
}
