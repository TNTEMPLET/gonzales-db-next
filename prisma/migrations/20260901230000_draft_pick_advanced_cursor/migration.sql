-- Tracks whether a DraftPick actually advanced the live session cursor when
-- it was created (a normal on-the-clock pick or a skip-driven scan landing
-- here) vs. a backfill/pre-claim elsewhere. Needed so undo can tell those
-- apart -- comparing slot position to the *current* cursor value alone is
-- ambiguous once a pick's own creation can jump the cursor forward past
-- several already-filled slots in one step.
ALTER TABLE "DraftPick" ADD COLUMN "advancedCursor" BOOLEAN NOT NULL DEFAULT false;
