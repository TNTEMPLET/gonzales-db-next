-- Consolidate all social posts under AP Baseball-wide scope (not per league org).
UPDATE "SocialPost" SET "organizationId" = 'ap-baseball';

ALTER TABLE "SocialPost" ALTER COLUMN "organizationId" SET DEFAULT 'ap-baseball';
