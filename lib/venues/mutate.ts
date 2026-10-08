import prisma from "@/lib/prisma";
import { confirmSuggestionPlan } from "@/lib/venues/match";
import { listVenueMatchInputs } from "@/lib/venues/load";
import type { VenueWriteInput } from "@/lib/venues/validate";

type WriteResult = { ok: true } | { ok: false; status: number; error: string };

class ConfirmStop extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function createVenue(input: VenueWriteInput): Promise<WriteResult> {
  const taken = await prisma.venue.findUnique({
    where: { normalizedName: input.normalizedName },
    select: { id: true },
  });
  if (taken) {
    return { ok: false, status: 409, error: "A shared park with this name already exists." };
  }
  try {
    await prisma.venue.create({
      data: {
        name: input.name,
        shortName: input.shortName,
        address: input.address,
        notes: input.notes,
        isActive: input.isActive,
        normalizedName: input.normalizedName,
      },
    });
  } catch (err) {
    if (isUniqueConflict(err)) {
      return { ok: false, status: 409, error: "A shared park with this name already exists." };
    }
    throw err;
  }
  return { ok: true };
}

export async function updateVenue(id: string, input: VenueWriteInput): Promise<WriteResult> {
  const current = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
  if (!current) return { ok: false, status: 404, error: "Shared park not found." };
  const taken = await prisma.venue.findUnique({
    where: { normalizedName: input.normalizedName },
    select: { id: true },
  });
  if (taken && taken.id !== id) {
    return { ok: false, status: 409, error: "A shared park with this name already exists." };
  }
  try {
    await prisma.venue.update({
      where: { id },
      data: {
        name: input.name,
        shortName: input.shortName,
        address: input.address,
        notes: input.notes,
        isActive: input.isActive,
        normalizedName: input.normalizedName,
      },
    });
  } catch (err) {
    if (isUniqueConflict(err)) {
      return { ok: false, status: 409, error: "A shared park with this name already exists." };
    }
    throw err;
  }
  return { ok: true };
}

export async function linkSchedulePark(
  scheduleParkId: string,
  venueId: string | null,
): Promise<WriteResult> {
  const park = await prisma.schedulePark.findUnique({
    where: { id: scheduleParkId },
    select: { id: true },
  });
  if (!park) return { ok: false, status: 404, error: "League park not found." };
  if (venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venue) return { ok: false, status: 404, error: "Shared park not found." };
  }
  await prisma.schedulePark.update({
    where: { id: scheduleParkId },
    data: { venueId },
  });
  return { ok: true };
}

export async function confirmParkSuggestion(parkId: string): Promise<WriteResult> {
  const { venues, parks } = await listVenueMatchInputs();
  const plan = confirmSuggestionPlan(parkId, parks, venues);
  if (plan.action === "none") {
    return { ok: false, status: 409, error: "No suggestion to confirm. Refresh and try again." };
  }
  if (plan.action === "link") {
    const updated = await prisma.schedulePark.updateMany({
      where: { id: plan.parkId, venueId: null },
      data: { venueId: plan.venueId },
    });
    if (updated.count !== 1) {
      return { ok: false, status: 409, error: "That league park is already linked." };
    }
    return { ok: true };
  }

  const create = plan.create;
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.schedulePark.findUnique({
        where: { id: parkId },
        select: { venueId: true },
      });
      if (!current) throw new ConfirmStop(404, "League park not found.");
      if (current.venueId) throw new ConfirmStop(409, "That league park is already linked.");
      const existing = await tx.venue.findUnique({
        where: { normalizedName: create.normalizedName },
        select: { id: true },
      });
      const venue =
        existing ??
        (await tx.venue.create({
          data: {
            name: create.name,
            shortName: create.shortName,
            address: create.address,
            normalizedName: create.normalizedName,
          },
        }));
      await tx.schedulePark.updateMany({
        where: { id: { in: create.parkIds }, venueId: null },
        data: { venueId: venue.id },
      });
    });
  } catch (err) {
    if (err instanceof ConfirmStop) return { ok: false, status: err.status, error: err.message };
    if (!isUniqueConflict(err)) throw err;
    const venue = await prisma.venue.findUnique({
      where: { normalizedName: create.normalizedName },
      select: { id: true },
    });
    if (!venue) throw err;
    const updated = await prisma.schedulePark.updateMany({
      where: { id: parkId, venueId: null },
      data: { venueId: venue.id },
    });
    if (updated.count !== 1) {
      return { ok: false, status: 409, error: "That league park is already linked." };
    }
  }
  return { ok: true };
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
