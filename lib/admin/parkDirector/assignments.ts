import prisma from "@/lib/prisma";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";
import type { AdminRole } from "@/lib/auth/adminRoles";

export type ParkDirectorAssignmentScreen = {
  directors: {
    id: string;
    email: string;
    name: string | null;
    orgRoles: Partial<Record<ContentOrgId, AdminRole>>;
    venues: { id: string; name: string; active: boolean }[];
  }[];
  venues: { id: string; name: string; shortName: string | null; isActive: boolean }[];
};

type WriteResult = { ok: true } | { ok: false; status: number; error: string };

function cleanId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || /\s/.test(trimmed)) return null;
  return trimmed;
}

export async function loadParkDirectorAssignmentScreen(): Promise<ParkDirectorAssignmentScreen> {
  const [memberships, venues] = await Promise.all([
    prisma.adminOrgMembership.findMany({
      where: { role: "PARK_DIRECTOR", adminUser: { isMaster: false } },
      select: {
        adminUser: {
          select: {
            id: true,
            email: true,
            name: true,
            orgMemberships: { select: { organizationId: true, role: true } },
          },
        },
      },
    }),
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, shortName: true, isActive: true },
    }),
  ]);

  const directors = new Map<string, ParkDirectorAssignmentScreen["directors"][number]>();
  for (const row of memberships) {
    const user = row.adminUser;
    if (directors.has(user.id)) continue;
    const orgRoles: Partial<Record<ContentOrgId, AdminRole>> = {};
    for (const membership of user.orgMemberships) {
      if (isContentOrgId(membership.organizationId)) {
        orgRoles[membership.organizationId] = membership.role;
      }
    }
    directors.set(user.id, {
      id: user.id,
      email: user.email,
      name: user.name,
      orgRoles,
      venues: [],
    });
  }

  const directorIds = [...directors.keys()];
  if (directorIds.length > 0) {
    const assignments = await prisma.parkDirectorAssignment.findMany({
      where: { adminUserId: { in: directorIds } },
      select: {
        adminUserId: true,
        active: true,
        venue: { select: { id: true, name: true } },
      },
      orderBy: [{ venue: { name: "asc" } }],
    });
    for (const assignment of assignments) {
      directors.get(assignment.adminUserId)?.venues.push({
        id: assignment.venue.id,
        name: assignment.venue.name,
        active: assignment.active,
      });
    }
  }

  return {
    directors: [...directors.values()].sort((a, b) => a.email.localeCompare(b.email)),
    venues,
  };
}

async function assertDirectorAndVenue(
  adminUserId: string,
  venueId: string,
): Promise<WriteResult> {
  const [user, venue] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: {
        id: true,
        isMaster: true,
        orgMemberships: {
          where: { role: "PARK_DIRECTOR" },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } }),
  ]);
  if (!user) return { ok: false, status: 404, error: "User not found." };
  if (user.isMaster || user.orgMemberships.length === 0) {
    return { ok: false, status: 400, error: "Parks can be assigned only to a park director." };
  }
  if (!venue) return { ok: false, status: 404, error: "Shared park not found." };
  return { ok: true };
}

export async function assignParkDirectorVenue(input: {
  actorAdminId: string;
  adminUserId: string;
  venueId: string;
}): Promise<WriteResult> {
  const adminUserId = cleanId(input.adminUserId);
  const venueId = cleanId(input.venueId);
  if (!adminUserId || !venueId) {
    return { ok: false, status: 400, error: "Choose a park director and a shared park." };
  }
  const ready = await assertDirectorAndVenue(adminUserId, venueId);
  if (!ready.ok) return ready;
  await prisma.parkDirectorAssignment.upsert({
    where: { adminUserId_venueId: { adminUserId, venueId } },
    create: {
      adminUserId,
      venueId,
      active: true,
      assignedByAdminId: input.actorAdminId,
    },
    update: {
      active: true,
      assignedByAdminId: input.actorAdminId,
    },
  });
  return { ok: true };
}

export async function unassignParkDirectorVenue(input: {
  adminUserId: string;
  venueId: string;
}): Promise<WriteResult> {
  const adminUserId = cleanId(input.adminUserId);
  const venueId = cleanId(input.venueId);
  if (!adminUserId || !venueId) {
    return { ok: false, status: 400, error: "Choose a park director and a shared park." };
  }
  const updated = await prisma.parkDirectorAssignment.updateMany({
    where: { adminUserId, venueId, active: true },
    data: { active: false },
  });
  if (updated.count !== 1) {
    return { ok: false, status: 404, error: "That park is not assigned." };
  }
  return { ok: true };
}
