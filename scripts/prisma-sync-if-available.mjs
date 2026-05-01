import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import bcrypt from "bcryptjs";

const INITIAL_MASTER_ADMIN_EMAIL = (
  process.env.INITIAL_MASTER_ADMIN_EMAIL || "trent@apbaseball.com"
).trim().toLowerCase();
const INITIAL_MASTER_ADMIN_PASSWORD = process.env.INITIAL_MASTER_ADMIN_PASSWORD || "";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    "[prisma-sync] Skipping prisma db push (DATABASE_URL is not set).",
  );
  process.exit(0);
}

console.log("[prisma-sync] Running prisma db push...");
const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status !== "number" || result.status !== 0) {
  process.exit(result.status ?? 1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPostgresAdapter({ connectionString: databaseUrl }),
});

try {
  const email = INITIAL_MASTER_ADMIN_EMAIL;
  const bootstrapPasswordHash = INITIAL_MASTER_ADMIN_PASSWORD
    ? await bcrypt.hash(INITIAL_MASTER_ADMIN_PASSWORD, 12)
    : null;
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: "Trent Templet",
      role: "MASTER_ADMIN",
      isMaster: true,
      passwordHash: bootstrapPasswordHash,
    },
    update: {
      role: "MASTER_ADMIN",
      isMaster: true,
    },
  });
  if (!admin.passwordHash && bootstrapPasswordHash) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: bootstrapPasswordHash },
    });
  }
  if (!bootstrapPasswordHash) {
    console.warn(
      "[prisma-sync] INITIAL_MASTER_ADMIN_PASSWORD is not set; master admin password login may fail until a password is configured.",
    );
  }
  console.log(`[prisma-sync] Ensured initial master admin: ${email}`);
} finally {
  await prisma.$disconnect();
}

process.exit(0);
