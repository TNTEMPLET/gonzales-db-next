import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "prisma/config";

const require = createRequire(import.meta.url);
// Load env in the same priority order Next.js dev uses:
// .env.local first (base), then .env.development.local overrides it.
// This ensures `prisma migrate dev` / `prisma db push` target the DEV database
// by default — matching what the running local dev servers connect to.
//
// ⚠️  PRODUCTION MIGRATIONS: to apply a migration to production, the caller
// must set DATABASE_URL in the shell environment *before* running the command
// (shell env takes precedence over dotenv files):
//
//   DATABASE_URL="<prod-url>" npx prisma migrate deploy
//
// Never run `prisma migrate dev` or `prisma db push` pointed at prod.
require("dotenv").config({ path: path.join(__dirname, ".env.local") });
require("dotenv").config({ path: path.join(__dirname, ".env.development.local"), override: true });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  // Prisma CLI supports migrate.adapter; bundled PrismaConfig type omits it in this release.
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
