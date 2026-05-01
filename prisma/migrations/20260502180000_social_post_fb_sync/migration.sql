-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "syncedFromFacebook" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: one row per org per Facebook post id (multiple NULL facebookPostId still allowed in PostgreSQL)
CREATE UNIQUE INDEX "SocialPost_organizationId_facebookPostId_key" ON "SocialPost"("organizationId", "facebookPostId");
