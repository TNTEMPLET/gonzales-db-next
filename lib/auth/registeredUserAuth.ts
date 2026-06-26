import prisma from "@/lib/prisma";
import { recordDuplicateCandidatesForNewUser } from "@/lib/registeredUserDuplicates";
import { getDefaultContentOrg, getOrgId } from "@/lib/siteConfig";

const registeredUserLoginSelect = {
  id: true,
  organizationId: true,
  email: true,
  googleSub: true,
  name: true,
  firstName: true,
  lastName: true,
  contactPhone: true,
  ageGroup: true,
  assignedTeam: true,
  isCoach: true,
  isBlocked: true,
} as const;

function getRegisteredUserOrgId() {
  const siteOrg = getOrgId();
  // Master deployment promotes users from content-org user pools.
  return siteOrg === "master" ? getDefaultContentOrg() : siteOrg;
}

type GoogleProfileInput = {
  email: string;
  sub: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
};

export async function upsertRegisteredUserFromGoogle(
  input: GoogleProfileInput,
) {
  const orgId = getRegisteredUserOrgId();
  const existingBySub = await prisma.registeredUser.findUnique({
    where: { googleSub: input.sub },
    select: registeredUserLoginSelect,
  });

  if (existingBySub && existingBySub.email !== input.email) {
    throw new Error(
      "This Google account is already linked to a different email in the system.",
    );
  }

  // Reuse the already linked Google account to avoid global googleSub unique
  // collisions when the same person signs in across multiple org deployments.
  if (existingBySub) {
    if (existingBySub.organizationId !== orgId) {
      const existingByEmailInOrg = await prisma.registeredUser.findFirst({
        where: { organizationId: orgId, email: input.email },
        select: registeredUserLoginSelect,
      });

      if (existingByEmailInOrg) {
        // Move the googleSub link to the current org/email row without violating
        // global unique constraints on googleSub.
        return prisma.$transaction(async (tx) => {
          await tx.registeredUser.update({
            where: { id: existingBySub.id },
            data: { googleSub: null },
            select: { id: true },
          });
          return tx.registeredUser.update({
            where: { id: existingByEmailInOrg.id },
            data: {
              googleSub: input.sub,
              name: input.name,
              firstName: input.firstName,
              lastName: input.lastName,
            },
            select: registeredUserLoginSelect,
          });
        });
      }
    }

    return prisma.registeredUser.update({
      where: { id: existingBySub.id },
      data: {
        organizationId: orgId,
        email: input.email,
        googleSub: input.sub,
        name: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      select: registeredUserLoginSelect,
    });
  }

  const existingByEmail = await prisma.registeredUser.findFirst({
    where: { organizationId: orgId, email: input.email },
    select: registeredUserLoginSelect,
  });

  if (existingByEmail) {
    if (existingByEmail.googleSub && existingByEmail.googleSub !== input.sub) {
      throw new Error(
        "This email is already linked to a different Google account.",
      );
    }

    return prisma.registeredUser.update({
      where: { id: existingByEmail.id },
      data: {
        googleSub: input.sub,
        name: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      select: registeredUserLoginSelect,
    });
  }

  const created = await prisma.registeredUser.create({
    data: {
      organizationId: orgId,
      email: input.email,
      googleSub: input.sub,
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: registeredUserLoginSelect,
  });
  await recordDuplicateCandidatesForNewUser(prisma, created);
  return created;
}
