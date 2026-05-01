-- DropIndex
DROP INDEX "AllStarVaultAccess_role_updatedAt_idx";

-- AlterTable
ALTER TABLE "AllStarVaultAccess" ALTER COLUMN "organizationId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeamPlayer" ADD COLUMN     "birthCertificateStatus" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "codeOfConductAccepted" BOOLEAN,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianFirstName" TEXT,
ADD COLUMN     "guardianLastName" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "jerseySize" TEXT,
ADD COLUMN     "liabilityWaiverAccepted" BOOLEAN,
ADD COLUMN     "medicalConditionsDetails" TEXT,
ADD COLUMN     "medicalConditionsSummary" TEXT,
ADD COLUMN     "medicalTreatmentAuthorized" BOOLEAN,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "playedPriorSeason" BOOLEAN,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "priorSeasonTeamInfo" TEXT,
ADD COLUMN     "refundPolicyAccepted" BOOLEAN,
ADD COLUMN     "registrationOrderDate" TIMESTAMP(3),
ADD COLUMN     "registrationOrderNo" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "streetAddress" TEXT,
ADD COLUMN     "unit" TEXT;
