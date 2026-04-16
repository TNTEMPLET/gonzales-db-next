// @ts-nocheck
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: "file:./prisma/dev.db",
  },
  migrate: {
    async adapter() {
      const { PrismaBetterSqlite3 } =
        await import("@prisma/adapter-better-sqlite3");
      return new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
    },
  },
});
