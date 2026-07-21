-- CreateTable
CREATE TABLE "NewsPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsPostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsPostMedia_postId_sortOrder_idx" ON "NewsPostMedia"("postId", "sortOrder");

-- AddForeignKey
ALTER TABLE "NewsPostMedia" ADD CONSTRAINT "NewsPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
