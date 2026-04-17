// @ts-nocheck
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    async adapter() {
      const { PrismaPostgresAdapter } = await import("@prisma/adapter-ppg");
      return new PrismaPostgresAdapter({
        connectionString: process.env.DATABASE_URL!,
      });
    },
  },
});
