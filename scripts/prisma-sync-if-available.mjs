import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

const INITIAL_MASTER_ADMIN_EMAIL = "trent@apbaseball.com";

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
  const email = INITIAL_MASTER_ADMIN_EMAIL.trim().toLowerCase();
  await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: "Trent Templet",
      role: "MASTER_ADMIN",
      isMaster: true,
      passwordHash: null,
    },
    update: {
      role: "MASTER_ADMIN",
      isMaster: true,
    },
  });
  console.log(`[prisma-sync] Ensured initial master admin: ${email}`);
} finally {
  await prisma.$disconnect();
}

process.exit(0);
