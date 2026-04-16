import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export function createSqliteAdapter() {
  return new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
}
