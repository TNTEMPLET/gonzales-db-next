ALTER TABLE "RegisteredUser"
ADD COLUMN "abuseAwarenessTrainingCertificateUrl" TEXT,
ADD COLUMN "abuseAwarenessTrainingCertificateFileName" TEXT,
ADD COLUMN "abuseAwarenessTrainingCertificateMimeType" TEXT,
ADD COLUMN "abuseAwarenessTrainingCertificateUploadedAt" TIMESTAMP(3);
