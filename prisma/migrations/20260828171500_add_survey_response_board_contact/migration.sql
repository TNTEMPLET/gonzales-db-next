-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "wantsBoardContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactPhone" TEXT;
