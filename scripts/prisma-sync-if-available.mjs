import { spawnSync } from "node:child_process";

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

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
