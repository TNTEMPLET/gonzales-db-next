import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "prisma/config";

const require = createRequire(import.meta.url);
// Load env in the same priority order Next.js dev uses:
// .env.local first (base), then .env.development.local overrides it.
// This ensures `prisma migrate dev` / `prisma db push` target the DEV database
// by default — matching what the running local dev servers connect to.
//
// CI (GitHub Actions) must not load those files. `.env.development.local` is
// loaded with `override: true`, which would replace a workflow's DATABASE_URL
// (the staging or production secret, or the throwaway CI database). In CI the
// step environment is the only source for DATABASE_URL and SHADOW_DATABASE_URL.
//
// Staging and production migrations are applied by
// `.github/workflows/db-migrate.yml`, not by pointing a laptop at those URLs.
const inCi = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
if (!inCi) {
  require("dotenv").config({ path: path.join(__dirname, ".env.local") });
  require("dotenv").config({ path: path.join(__dirname, ".env.development.local"), override: true });
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
    // `prisma migrate diff --from-migrations` replays the migration chain here.
    // Prisma 7.8 reads this URL from the config (there is no --shadow-database-url flag).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  // Prisma CLI supports migrate.adapter; bundled PrismaConfig type omits it in this release.
  // defineConfig() drops unknown keys, so the schema engine connects with datasource.url
  // for normal Postgres. The adapter stays for db.prisma.io / prisma-data.net hosts.
  // @ts-expect-error — migrate block is valid for prisma migrate
  migrate: {
    async adapter() {
      const connectionString = process.env.DATABASE_URL!;
      if (/db\.prisma\.io|prisma-data\.net/i.test(connectionString)) {
        const { PrismaPostgresAdapter } = require("@prisma/adapter-ppg");
        return new PrismaPostgresAdapter({ connectionString });
      }
      const { PrismaPg } = require("@prisma/adapter-pg");
      const pg = require("pg");
      return new PrismaPg(new pg.Pool({ connectionString }));
    },
  },
});
