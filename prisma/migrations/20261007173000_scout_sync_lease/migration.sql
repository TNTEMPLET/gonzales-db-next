-- Lease so a cron sync and "Run Scout now" cannot rewind the inbox cursor.
-- Nullable columns on the new ScoutSyncState table only. No rewrite of existing tables.

ALTER TABLE "ScoutSyncState" ADD COLUMN "syncLeaseUntil" TIMESTAMP(3),
ADD COLUMN "syncLeaseToken" TEXT;
