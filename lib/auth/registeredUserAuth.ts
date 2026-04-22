import prisma from "@/lib/prisma";

const orgId = process.env.SITE_ORG ?? "gonzales";

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
  const existingBySub = await prisma.registeredUser.findUnique({
    where: { googleSub: input.sub },
  });

  if (existingBySub && existingBySub.email !== input.email) {
    throw new Error(
      "This Google account is already linked to a different email in the system.",
    );
  }

  const existingByEmail = await prisma.registeredUser.findFirst({
    where: { organizationId: orgId, email: input.email },
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
    });
  }

  return prisma.registeredUser.create({
    data: {
      organizationId: orgId,
      email: input.email,
      googleSub: input.sub,
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });
}
