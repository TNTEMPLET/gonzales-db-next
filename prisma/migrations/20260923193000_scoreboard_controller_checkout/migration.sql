ALTER TABLE "ScheduleDraftGame" DROP COLUMN "scoreboardControllerName";
ALTER TABLE "ScheduleDraftGame" ADD COLUMN "scoreboardCheckedOutAt" TIMESTAMP(3);
ALTER TABLE "ScheduleDraftGame" ADD COLUMN "scoreboardCheckedInAt" TIMESTAMP(3);
ALTER TABLE "ScheduleDraftGame" ADD COLUMN "scoreboardCheckoutSide" TEXT;
