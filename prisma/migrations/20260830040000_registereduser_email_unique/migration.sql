-- RegisteredUser.email becomes globally unique (person-level identity).
-- Repeated find-then-create coach re-imports (and the equivalent
-- find-then-create Google sign-in path) had no atomic guarantee against
-- this, letting the same real person accumulate a dozen-plus duplicate
-- global identities. Existing duplicates were merged out-of-band before
-- this migration -- do not apply this to a database with duplicate emails
-- still present, it will fail.

DROP INDEX IF EXISTS "RegisteredUser_email_idx";

CREATE UNIQUE INDEX "RegisteredUser_email_key" ON "RegisteredUser"("email");
