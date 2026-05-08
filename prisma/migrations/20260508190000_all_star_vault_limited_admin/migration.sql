-- Rename vault role: view-only grants become "limited admin" (ballot ops + read tools; no cycle management).
ALTER TYPE "AllStarVaultRole" RENAME VALUE 'VIEW_ONLY' TO 'LIMITED_ADMIN';
