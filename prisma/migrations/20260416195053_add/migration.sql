-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "author" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "rotatorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NewsPost" ("author", "content", "createdAt", "excerpt", "featured", "id", "imageUrl", "publishedAt", "slug", "status", "title", "updatedAt") SELECT "author", "content", "createdAt", "excerpt", "featured", "id", "imageUrl", "publishedAt", "slug", "status", "title", "updatedAt" FROM "NewsPost";
DROP TABLE "NewsPost";
ALTER TABLE "new_NewsPost" RENAME TO "NewsPost";
CREATE UNIQUE INDEX "NewsPost_slug_key" ON "NewsPost"("slug");
CREATE INDEX "NewsPost_status_publishedAt_idx" ON "NewsPost"("status", "publishedAt");
CREATE INDEX "NewsPost_slug_idx" ON "NewsPost"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
