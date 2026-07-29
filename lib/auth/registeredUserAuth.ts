import prisma from "@/lib/prisma";
import { recordDuplicateCandidatesForNewUser } from "@/lib/registeredUserDuplicates";
import { getDefaultContentOrg, getOrgId } from "@/lib/siteConfig";

export type RegisteredUserWithProfile = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  contactPhone: string | null;
  googleSub: string | null;
  isBlocked: boolean;
  // Effective per-org values for the context org (null if no profile yet)
  isCoach: boolean;
  ageGroup: string | null;
  assignedTeam: string | null;
  // The org for which the above per-org fields apply
  activeOrgId: string;
};

const globalUserSelect = {
  name: true,
  firstName: true,
  lastName: true,
  contactPhone: true,
  googleSub: true,
  isBlocked: true,
} as const;

const globalUserSelectWithIdEmail = {
  id: true,
  email: true,
  ...globalUserSelect,
} as const;

function getDefaultOrgForProfile() {
  const siteOrg = getOrgId();
  // Master / tournament-only deployments still need a content org for most profiles.
  // Callers that want "master" for Board Room explicitly pass it.
  return siteOrg === "master" || siteOrg === "ladistrict2" || siteOrg === "ladistrict6"
    ? getDefaultContentOrg()
    : siteOrg;
}

/**
 * Ensure a minimal org profile row exists for this global user + org.
 * Returns the effective per-org values (or defaults).
 */
async function ensureOrgProfile(
  tx: any,
  registeredUserId: string,
  organizationId: string,
): Promise<{ isCoach: boolean; ageGroup: string | null; assignedTeam: string | null }> {
  const existing = await tx.registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId, organizationId },
    },
    select: { isCoach: true, ageGroup: true, assignedTeam: true },
  });
  if (existing) return existing;

  const created = await tx.registeredUserOrgProfile.create({
    data: {
      registeredUserId,
      organizationId,
      isCoach: false,
      ageGroup: null,
      assignedTeam: null,
    },
    select: { isCoach: true, ageGroup: true, assignedTeam: true },
  });
  return created;
}

/**
 * Load a global user + ensure (and return) the effective profile for a given org.
 */
async function loadUserWithProfile(
  userId: string,
  organizationId: string,
): Promise<RegisteredUserWithProfile | null> {
  const user = await prisma.registeredUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      ...globalUserSelect,
    },
  });
  if (!user) return null;

  const profile = await ensureOrgProfile(prisma, userId, organizationId);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    contactPhone: user.contactPhone,
    googleSub: user.googleSub,
    isBlocked: user.isBlocked,
    isCoach: profile.isCoach,
    ageGroup: profile.ageGroup,
    assignedTeam: profile.assignedTeam,
    activeOrgId: organizationId,
  };
}

type GoogleProfileInput = {
  email: string;
  sub: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
};

/**
 * Global identity upsert (Parent).
 * Always ensures a child profile for the requested org (creates if missing).
 * Returns a shape that includes effective per-org fields for backward compatibility at call sites.
 */
export async function upsertRegisteredUserFromGoogle(
  input: GoogleProfileInput,
  explicitOrgId?: string,
) {
  const orgId = explicitOrgId || getDefaultOrgForProfile();

  // 1) Find or create the GLOBAL person by strong key (googleSub) then email.
  let globalUser = await prisma.registeredUser.findUnique({
    where: { googleSub: input.sub },
    select: globalUserSelectWithIdEmail,
  });

  if (globalUser && globalUser.email !== input.email) {
    throw new Error(
      "This Google account is already linked to a different email in the system.",
    );
  }

  if (!globalUser) {
    // Try email match (case-insensitive) for people who previously had per-org rows.
    const byEmail = await prisma.registeredUser.findFirst({
      where: { email: input.email },
      select: globalUserSelectWithIdEmail,
    });

    if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== input.sub) {
        throw new Error("This email is already linked to a different Google account.");
      }
      // Attach the googleSub to the global row.
      globalUser = await prisma.registeredUser.update({
        where: { id: byEmail.id },
        data: {
          googleSub: input.sub,
          name: input.name,
          firstName: input.firstName,
          lastName: input.lastName,
          contactPhone: byEmail.contactPhone ?? null,
        },
        select: globalUserSelectWithIdEmail,
      });
    } else {
      globalUser = await prisma.registeredUser.create({
        data: {
          email: input.email,
          googleSub: input.sub,
          name: input.name,
          firstName: input.firstName,
          lastName: input.lastName,
        },
        select: globalUserSelectWithIdEmail,
      });
      await recordDuplicateCandidatesForNewUser(prisma, {
        id: globalUser.id,
        // For duplicate detection we still pass a representative org (best effort).
        organizationId: orgId,
        firstName: input.firstName,
        lastName: input.lastName,
        name: input.name,
      });
    }
  } else {
    // Update basic global fields if provided.
    globalUser = await prisma.registeredUser.update({
      where: { id: globalUser.id },
      data: {
        email: input.email,
        name: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      select: globalUserSelectWithIdEmail,
    });
  }

  // 2) Ensure a profile row exists for this org (the "child").
  await ensureOrgProfile(prisma, globalUser.id, orgId);

  // 3) Return with effective per-org view.
  return loadUserWithProfile(globalUser.id, orgId);
}

/**
 * Public helper: given a global user id and an org, ensure the profile and return the enriched shape.
 */
export async function getRegisteredUserWithOrgProfile(
  userId: string,
  organizationId: string,
): Promise<RegisteredUserWithProfile | null> {
  return loadUserWithProfile(userId, organizationId);
}
