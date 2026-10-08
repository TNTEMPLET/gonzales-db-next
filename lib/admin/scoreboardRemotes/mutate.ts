import "server-only";

import { Prisma } from "@prisma/client";

import type { AdminSessionUser } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { isContentOrgId } from "@/lib/siteConfig";

import { authorizeRemoteGameWrite, loadRemoteActor } from "@/lib/admin/scoreboardRemotes/auth";
import { decideRemoteInventoryWrite } from "@/lib/admin/scoreboardRemotes/access";
import {
  decideCheckInAccess,
  decideScoreboardCheckIn,
  decideScoreboardCheckout,
  isPostedRemoteGame,
  statusClosesOpenCheckout,
} from "@/lib/admin/scoreboardRemotes/checkoutRules";
import { parseRemoteControllerWrite } from "@/lib/admin/scoreboardRemotes/validate";

export type RemoteMutation = { ok: true } | { ok: false; status: number; error: string };

const LABEL_TAKEN = "A remote at this park already uses that label.";

function uniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function inventoryWrite(
  admin: AdminSessionUser,
  venueId: string,
  orgId: string,
): Promise<RemoteMutation | null> {
  if (!isContentOrgId(orgId)) return { ok: false, status: 400, error: "Unknown league." };
  const actor = await loadRemoteActor(admin, orgId);
  if (!actor) return { ok: false, status: 403, error: "You cannot manage remotes for this league." };
  const decision = decideRemoteInventoryWrite({
    isMaster: admin.isMaster,
    role: actor.role,
    venueId,
    leagueVenueIds: actor.leagueVenueIds,
    assignedVenueIds: actor.assignedVenueIds,
  });
  if (!decision.allowed) {
    const error =
      decision.reason === "read_only"
        ? "You can look up remotes. A league admin or the park director changes them."
        : decision.reason === "unassigned_director"
          ? "Assign this director to the park before adding remotes."
          : "That park is not one you manage.";
    return { ok: false, status: 403, error };
  }
  return null;
}

export async function createScoreboardController(
  admin: AdminSessionUser,
  input: { orgId: string; venueId: string; label: unknown; homeFieldName?: unknown; notes?: unknown },
): Promise<RemoteMutation> {
  const parsed = parseRemoteControllerWrite(input, { requireStatus: false });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const venueId = input.venueId.trim();
  if (!venueId) return { ok: false, status: 400, error: "Choose a park." };
  const denied = await inventoryWrite(admin, venueId, input.orgId);
  if (denied) return denied;
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!venue) return { ok: false, status: 404, error: "That park was not found." };
  try {
    await prisma.scoreboardController.create({
      data: {
        venueId,
        label: parsed.value.label,
        homeFieldName: parsed.value.homeFieldName,
        notes: parsed.value.notes,
        status: "ACTIVE",
      },
    });
  } catch (error: unknown) {
    if (uniqueConflict(error)) return { ok: false, status: 409, error: LABEL_TAKEN };
    throw error;
  }
  return { ok: true };
}

export async function updateScoreboardController(
  admin: AdminSessionUser,
  input: {
    orgId: string;
    controllerId: string;
    label: unknown;
    homeFieldName?: unknown;
    notes?: unknown;
    status: unknown;
  },
): Promise<RemoteMutation> {
  const parsed = parseRemoteControllerWrite(input, { requireStatus: true });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const controller = await prisma.scoreboardController.findUnique({
    where: { id: input.controllerId.trim() },
    select: { id: true, venueId: true },
  });
  if (!controller) return { ok: false, status: 404, error: "That remote was not found." };
  const denied = await inventoryWrite(admin, controller.venueId, input.orgId);
  if (denied) return denied;
  const status = parsed.value.status;
  if (!status) return { ok: false, status: 400, error: "Choose active, missing, repair, or retired." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.scoreboardController.update({
        where: { id: controller.id },
        data: {
          label: parsed.value.label,
          homeFieldName: parsed.value.homeFieldName,
          notes: parsed.value.notes,
          status,
        },
      });
      if (statusClosesOpenCheckout(status)) {
        await tx.scoreboardCheckout.updateMany({
          where: { controllerId: controller.id, checkedInAt: null },
          data: { checkedInAt: new Date(), checkedInByAdminId: admin.id },
        });
      }
    });
  } catch (error: unknown) {
    if (uniqueConflict(error)) return { ok: false, status: 409, error: LABEL_TAKEN };
    throw error;
  }
  return { ok: true };
}

export async function checkoutScoreboardRemote(
  admin: AdminSessionUser,
  input: { gameId: string; controllerId: string; side: string; volunteerName: string; notes?: string | null },
): Promise<RemoteMutation> {
  const auth = await authorizeRemoteGameWrite(admin, input.gameId);
  if (!auth.ok) return auth;

  const game = await prisma.scheduleDraftGame.findUnique({
    where: { id: input.gameId.trim() },
    select: {
      id: true,
      organizationId: true,
      park: { select: { venueId: true } },
    },
  });
  const venueId = game?.park?.venueId ?? null;
  const [controller, venueRemoteCount, gameOpen, controllerOpen] = await Promise.all([
    prisma.scoreboardController.findUnique({
      where: { id: input.controllerId.trim() },
      select: { id: true, venueId: true, status: true },
    }),
    venueId ? prisma.scoreboardController.count({ where: { venueId } }) : Promise.resolve(0),
    prisma.scoreboardCheckout.findFirst({
      where: { scheduleDraftGameId: input.gameId.trim(), checkedInAt: null },
      select: { id: true },
    }),
    prisma.scoreboardCheckout.findFirst({
      where: { controllerId: input.controllerId.trim(), checkedInAt: null },
      select: { id: true },
    }),
  ]);

  const decision = decideScoreboardCheckout({
    writeAllowed: true,
    gameVenueId: venueId,
    venueRemoteCount,
    gameHasOpenCheckout: Boolean(gameOpen),
    controller,
    controllerHasOpenCheckout: Boolean(controllerOpen),
    volunteerName: input.volunteerName,
    side: input.side,
  });
  if (!decision.ok) {
    const status = decision.error === "That remote is already checked out." ? 409 : 400;
    return { ok: false, status, error: decision.error };
  }
  if (!game) return { ok: false, status: 404, error: "Posted game not found." };

  const notes = input.notes?.replace(/\s+/g, " ").trim().slice(0, 500) || null;
  try {
    await prisma.$transaction(async (tx) => {
      const open = await tx.scoreboardCheckout.findFirst({
        where: { controllerId: input.controllerId.trim(), checkedInAt: null },
        select: { id: true },
      });
      if (open) throw new Error("OPEN_CHECKOUT");
      const gameOpen = await tx.scoreboardCheckout.findFirst({
        where: { scheduleDraftGameId: game.id, checkedInAt: null },
        select: { id: true },
      });
      if (gameOpen) throw new Error("GAME_OPEN");
      const current = await tx.scoreboardController.findUnique({
        where: { id: input.controllerId.trim() },
        select: { status: true, venueId: true },
      });
      if (!current || current.status !== "ACTIVE" || current.venueId !== venueId) {
        throw new Error("UNAVAILABLE");
      }
      await tx.scoreboardCheckout.create({
        data: {
          controllerId: input.controllerId.trim(),
          scheduleDraftGameId: game.id,
          organizationId: game.organizationId,
          side: decision.side,
          volunteerName: decision.volunteerName,
          checkedOutByAdminId: admin.id,
          notes,
        },
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "OPEN_CHECKOUT") {
      return { ok: false, status: 409, error: "That remote is already checked out." };
    }
    if (error instanceof Error && error.message === "GAME_OPEN") {
      return { ok: false, status: 409, error: "This game already has a remote out. Check it in first." };
    }
    if (error instanceof Error && error.message === "UNAVAILABLE") {
      return { ok: false, status: 400, error: "That remote is not available." };
    }
    if (uniqueConflict(error)) {
      return { ok: false, status: 409, error: "That remote is already checked out." };
    }
    throw error;
  }
  return { ok: true };
}

async function controllerInventoryWriteAllowed(
  admin: AdminSessionUser,
  checkout: { organizationId: string; controller: { venueId: string } },
): Promise<boolean> {
  if (!isContentOrgId(checkout.organizationId)) return false;
  const actor = await loadRemoteActor(admin, checkout.organizationId);
  if (!actor) return false;
  return decideRemoteInventoryWrite({
    isMaster: admin.isMaster,
    role: actor.role,
    venueId: checkout.controller.venueId,
    leagueVenueIds: actor.leagueVenueIds,
    assignedVenueIds: actor.assignedVenueIds,
  }).allowed;
}

export async function checkInScoreboardRemote(
  admin: AdminSessionUser,
  checkoutId: string,
): Promise<RemoteMutation> {
  const checkout = await prisma.scoreboardCheckout.findUnique({
    where: { id: checkoutId.trim() },
    select: {
      id: true,
      checkedInAt: true,
      organizationId: true,
      scheduleDraftGameId: true,
      controller: { select: { venueId: true } },
    },
  });
  if (!checkout) return { ok: false, status: 404, error: "That checkout was not found." };

  let gameStatus: string | null = null;
  let gameWriteAllowed = false;
  if (checkout.scheduleDraftGameId) {
    const game = await prisma.scheduleDraftGame.findUnique({
      where: { id: checkout.scheduleDraftGameId },
      select: { status: true },
    });
    gameStatus = game?.status ?? null;
    const auth = await authorizeRemoteGameWrite(admin, checkout.scheduleDraftGameId, {
      requirePosted: false,
    });
    if (auth.ok) {
      gameWriteAllowed = true;
    } else if (isPostedRemoteGame(gameStatus)) {
      return auth;
    }
  }

  const inventoryWriteAllowed = gameWriteAllowed
    ? false
    : await controllerInventoryWriteAllowed(admin, checkout);
  const access = decideCheckInAccess({
    gameStatus: checkout.scheduleDraftGameId ? gameStatus : null,
    gameWriteAllowed,
    inventoryWriteAllowed,
  });
  const writeAllowed = access.allowed;

  const decision = decideScoreboardCheckIn({
    writeAllowed,
    checkout: { checkedInAt: checkout.checkedInAt },
  });
  if (!decision.ok) {
    const status = decision.error === "That checkout was not found." ? 404 : 400;
    return { ok: false, status, error: decision.error };
  }

  const updated = await prisma.scoreboardCheckout.updateMany({
    where: { id: checkout.id, checkedInAt: null },
    data: { checkedInAt: new Date(), checkedInByAdminId: admin.id },
  });
  if (updated.count === 0) {
    return { ok: false, status: 400, error: "That remote is already checked in." };
  }
  return { ok: true };
}
