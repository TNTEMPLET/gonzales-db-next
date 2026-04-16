import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , emailArg, passwordArg, firstNameArg, lastNameArg] = process.argv;

  if (!emailArg) {
    console.error(
      "Usage: npm run admin:create -- <email> [password] [firstName] [lastName]",
    );
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const passwordHash = passwordArg ? await bcrypt.hash(passwordArg, 12) : null;
  const firstName = firstNameArg?.trim() || null;
  const lastName = lastNameArg?.trim() || null;
  const name =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : null;

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name,
      firstName,
      lastName,
      passwordHash,
    },
    update: {
      name,
      firstName,
      lastName,
      passwordHash: passwordHash ?? undefined,
    },
  });

  console.log(`Admin ready: ${admin.email} (${admin.name ?? "no name"})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
