-- Add SECOND_TEAM value to AllStarFinalRosterOverride enum.
-- This value is used for two-team All-Star cycles to tag players who vote into
-- the second-team slot (as opposed to SELECTED = first team).
-- NOTE: Postgres requires ADD VALUE outside a transaction for existing types.
ALTER TYPE "AllStarFinalRosterOverride" ADD VALUE IF NOT EXISTS 'SECOND_TEAM';
