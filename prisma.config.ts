import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "prisma/config";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

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
      const { PrismaPostgresAdapter } = await import("@prisma/adapter-ppg");
      return new PrismaPostgresAdapter({
        connectionString: process.env.DATABASE_URL!,
      });
    },
  },
});
