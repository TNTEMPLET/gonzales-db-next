# Code efficiency audit + refactor roadmap (2026-08)

Audit of `app/`, `lib/` + `services/` + `prisma/`, and `components/` + `hooks/` for
code-efficiency problems (not style/lint). Findings were spot-verified against
source; the two highest-risk items (`lib/allStar/auth.ts`, `hooks/useGameChangerLive.ts`)
and the two highest-severity frontend claims (`app/page.tsx`, `DugoutTimeline.tsx`)
were re-read directly to confirm line numbers and behavior before this doc was written.

No application code changes were made in this pass. This is the report + the
batched implementation roadmap for a follow-up task.

## Reference patterns already in this codebase (use these as templates)

- `app/schedule/page.tsx`, `app/all-star/page.tsx`, `app/coach-corner/page.tsx` —
  correct `Promise.all` usage for independent fetches.
- `hooks/gameChangerPollLoop.ts` + `PublishedTournamentTabs.tsx` — correct idle-stop
  polling and a single shared poll instance per page (not one per card).
- `lib/prisma.ts` — sound HMR-safe singleton (`PRISMA_SCHEMA_VERSION` version check).
- `components/admin/AdminTeamsManager.tsx`, `components/allStar/AllStarQRCode.tsx` —
  correct dynamic `import()` of heavy libs at point of use.

## Findings — routes (`app/`)

| # | File:line | Issue | Severity |
|---|---|---|---|
| R1 | `app/page.tsx:272-364` | Homepage does 5 independent sequential awaits (regOpen, rotatorPosts, featuredPosts, games, orgAlert) instead of running in parallel — hottest public page | High |
| R2 | `app/standings/page.tsx:24-53` | Sequential awaits for independent `gameScore` query + Assignr `fetchGames` call; `force-dynamic` (line 10) disables caching for data needing only ~30-60s freshness | High |
| R3 | `app/api/tournaments/[projectId]/gamechanger-live/route.ts` + `hooks/useGameChangerLive.ts:99-117` | Public tournament bracket page keeps polling GameChanger every 15-60s even when the browser tab is hidden — visibility only triggers an *extra* refetch on refocus, never gates the scheduled poll | High |
| R4 | `app/api/admin/all-star/invites/route.ts:98-140` | N+1: up to 4 sequential DB calls per invited email in a bulk-invite loop | Medium |
| R5 | `app/api/admin/teams/import/route.ts:301-306` | Per-CSV-row DB query solely to check if the import batch was cancelled | Medium |
| R6 | `app/api/admin/cap-orders/route.ts:124-149` | N+1 dedupe check per PayPal transaction instead of one `findMany`+`in` | Medium |
| R7 | `app/api/admin/social/sync/route.ts:57-70` | Sequential upsert per social post (up to 500 per sync) | Medium |
| R8 | `app/admin/page.tsx:95-119` | Nested N+1 (users × orgs) on every admin dashboard load | Medium |
| R9 | `app/news/page.tsx`, `app/park-info/page.tsx` | `force-dynamic` + DB read (+ markdown re-parse on park-info) on every request for content that changes every few days | Medium |
| R10 | `app/rosters/page.tsx` | `force-dynamic` for an admin-approved, infrequently-changing roster list | Medium |
| R11 | `app/dugout/page.tsx:171-177` | Two independent cookie/session lookups awaited sequentially instead of `Promise.all` | Low |
| R12 | `app/api/admin/scheduler/parks/route.ts:171-197` | Per-field/per-availability create/update loops instead of `createMany` | Low |
| R13 | `app/api/admin/all-star/payments/route.ts`, `vault-access/route.ts`, `exports/csv/route.ts` | Minor per-item update loops; CSV export over-fetches full candidate/submission rows | Low |

## Findings — data layer (`lib/`, `services/`, `prisma/`)

| # | File:line | Issue | Severity |
|---|---|---|---|
| L1 | `lib/allStar/auth.ts:36-55` (and 3 sibling functions) | `findMany` then loop-await per row checking vault access — gates 14+ routes under `app/api/admin/all-star/**`, runs on nearly every request to that module | High |
| L2 | `lib/communications/sender.ts:16-129` | `sendCampaignEmails` fully sequential per-recipient: suppression check, Resend send, delivery record write — no batching/concurrency limit, timeout risk on large campaigns | High |
| L3 | `lib/allStar/candidates.ts:7-25` | `resequenceCandidateBibNumbers` issues one `UPDATE` per candidate instead of a single batched statement — runs on every All-Star roster mutation | Medium |
| L4 | `lib/communications/resolver.ts:65-116` | `fetchExplicitUserCandidates` — per-user `findUnique` in a loop instead of one `findMany`+`in` | Medium |
| L5 | `lib/assignr/games.ts:67-88` | `enrichAssignrGamesWithAssignmentDetails` — N concurrent external API calls instead of a batch endpoint | Medium |
| L6 | `lib/gamechanger/unifiedScoreSync.ts:57-70` | Per-game upsert loop instead of a bulk write | Medium |
| L7 | `app/api/admin/tournament-brackets/ingest/route.ts` + `lib/tournament-brackets/ingestion/*` | Tesseract OCR + Vision-API fallback run inline/sequentially per PDF page inside the request handler (`maxDuration=120`), blocking | Medium-high |
| L8 | `lib/communications/resolver.ts:118-133` | `fetchAdminRoleCandidates` over-fetches entire `AdminUser` row (including `passwordHash`) via `include` instead of `select` | Medium (also a security-hygiene item) |
| L9 | entire `lib/` | Zero usage of `unstable_cache`/`React.cache` anywhere — admin session, org config, vault-access role all re-fetched from Postgres on every call within the same request | Medium (systemic) |
| L10 | `prisma/schema.prisma` | Missing indexes: `TeamPlayer.guardianEmail` (guardian portal), `TripParticipant.candidateId`/`paymentId`, `AdminAuditLog.targetRegisteredUserId`, `VolunteerRoleAssignment.teamId` | Low-medium |
| L11 | `lib/volunteers/service.ts:257-267` | Fetches an included relation (`teamCoachAssignments`) that's never used — dead over-fetch | Low |
| L12 | `lib/gamechanger/unifiedScoreSync.ts` | Refetches the full 5-day GameChanger scoreboard window on both "preview" and "import" admin actions instead of reusing the preview result | Low-medium |

Schema note: `prisma/schema.prisma` is otherwise unusually well-indexed (composite
`organizationId`+status/date indexes throughout) — the items in L10 are outliers,
not a systemic gap. `lib/prisma.ts`'s singleton pattern was verified healthy (no issue).

## Findings — frontend (`components/`, `hooks/`)

| # | File:line | Issue | Severity |
|---|---|---|---|
| F1 | `components/dugout/DugoutTimeline.tsx` (3406 lines) | Zero `React.memo`/`useCallback` in the entire file (confirmed by direct grep); any state change (e.g. one composer keystroke) re-renders the whole feed/comment tree; render logic done via plain functions called inline rather than extracted memoized subcomponents | High |
| F2 | `components/ScheduleTable.tsx:6-8` | `xlsx` + `jspdf` + `jspdf-autotable` statically imported at module top level but only used in click-triggered download handlers — this component renders on the public homepage schedule section (highest-traffic page), so all visitors download these bundles regardless of use | High |
| F3 | `components/brackets/TournamentBracketView.tsx` (`DoubleEliminationBracketView`, ~1308-1400) | Bracket slot-resolution functions recomputed every render with no `useMemo`; component receives `liveGameStatuses` which updates every 15-60s during live tournaments, so full slot re-derivation fires on every live-poll tick | Medium-high |
| F4 | entire `components/` tree | Zero `React.memo` usage across all 111 components — compounds F1/F3 on any list-heavy live-updating surface | Medium (systemic) |
| F5 | `components/dugout/DugoutTimeline.tsx:862-873` | 60s `setInterval` notification poll with no `document.visibilityState` guard (unlike the GameChanger hooks) | Medium |
| F6 | `components/admin/capOrders/ParentCapOrdersPanel.tsx:302-306`, `shirtOrders/ParentShirtOrdersPanel.tsx:632,652` | Same unconditional 30s poll pattern, no visibility check | Low |
| F7 | `components/admin/AdminSportsConnectDesk.tsx:4` | `xlsx` statically imported, used only in a file-picker change handler | Medium |
| F8 | `components/admin/TournamentBracketsClient.tsx:3`, `AdminReportsManager.tsx:7` | `jsPDF`/`jspdf-autotable` static-vs-dynamic import inconsistency within the same codebase | Low-medium |
| F9 | `components/admin/allStar/AllStarPlayerSearch.tsx:61` | Unmemoized filter of the full roster list on every render | Low |
| F10 | `hooks/useGameChangerLive.ts` + `useGameChangerAdminSync.ts` | ~90% duplicated polling/visibility/cleanup logic, could consolidate into one shared primitive | Low |
| F11 | `ParentShirtOrdersPanel.tsx` + `ParentCapOrdersPanel.tsx` | Near-duplicate "fetch+poll+sync+export" panel components for two merch types | Low |
| F12 | `components/brackets/ClassicTournamentInfoTable.tsx:1` | Unnecessary `"use client"` on a pure presentational component (isolated case, not widespread) | Low |
| F13 | `components/ScheduleTable.tsx:244-247` | Leftover `console.log` debug effect recomputing a projection on every schedule change, on the public homepage | Low |

---

## Refactor roadmap — 12 batches, priority order

Each batch below is scoped to be one reviewable, ideally revertable unit of work.
Given every push to `preview` triggers 3 Vercel preview deployments (per `CLAUDE.md`),
batches are also grouped into suggested push/PR boundaries at the end.

### Batch 1 — Public-page `Promise.all` quick wins
**Fixes:** R1, R2, R11.
**Why grouped:** identical mechanical transform (independent sequential awaits →
parallelize); correct in-repo template already exists (`app/schedule/page.tsx` etc.).
**Risk:** Low. Preserve `app/page.tsx`'s existing per-branch try/catch isolation —
don't let one failing fetch take down the others when converting to parallel awaits.
**Sequencing:** Do first — highest-traffic page, zero design ambiguity, easy to
verify visually on each org's dev port (3000/3001/3002).
**Research first:** No.

### Batch 2 — Bulk-write/N+1 quick wins in admin routes
**Fixes:** R6, R7, R12, R13, L3, L4, L8.
**Why grouped:** same shape of fix (loop-of-awaits → batched Prisma call), isolated
per-function, no cross-file coupling, no external API involved.
**Risk:** Low-medium. `resequenceCandidateBibNumbers` (L3) runs inside a transaction
on every All-Star roster mutation — verify bib-number ordering/uniqueness is
preserved when moving to a single batched statement (e.g. a `CASE`-based bulk
update) to avoid unique-constraint collisions mid-update. Call out the L8
`passwordHash` over-fetch fix as a security hygiene win in the PR description, not
just a perf note.
**Sequencing:** After batch 1 — mechanical but touches admin write-paths, wants a
normal review pass.
**Research first:** No, but confirm the bib-number batch approach preserves
per-cycle ordering before merging.

### Batch 3 — Bulk-invite/import N+1 with side effects
**Fixes:** R4, R5.
**Why grouped:** both are "loop over user-supplied bulk input, each iteration does
avoidable DB round-trips," but mix write-then-branch logic (invite upsert, org
profile upsert, revoke/find-or-create) that's easy to get subtly wrong if flattened
carelessly.
**Risk:** Medium. Pre-fetch all existing invites/registered users in one `findMany`
each (keyed by email), then loop only over in-memory logic before batched writes —
preserves per-row semantics (first-match-wins, revoked-invite handling) exactly.
**Sequencing:** After batch 2; avoid running bulk invites during an active All-Star
voting/invite cycle without smoke-testing first.
**Research first:** No, but test with a mixed batch (existing/new/revoked emails)
to confirm identical DB end-state before/after.

### Batch 4 — Caching strategy overhaul (needs research first)
**Fixes:** R9, R10, R2's `force-dynamic` half, L9 (systemic).
**Why grouped:** all reduce to "replace `force-dynamic` + uncached DB reads with a
short-TTL cache," and share one open design question that should be answered once:
what's the correct caching primitive in Next.js 16 for this codebase? Per
`CLAUDE.md`'s own warning, Next 16 conventions may differ from training data —
`unstable_cache` is a Next 14/15-era API; Next 16 promotes `"use cache"` +
`cacheLife`/`cacheTag` under `dynamicIO`. Its interaction with the 3-separate-
deployment-per-codebase build model (cache keys must not leak across `SITE_ORG`
builds) needs to be confirmed before touching 4+ files.
**Risk:** Low functionally (read-only, non-auth pages) but medium in "pick the
wrong abstraction, redo it across every file."
**Sequencing:** Resolve the research question first (see research brief below),
then apply one consistent pattern across all affected pages in one PR.
**Research first: YES** — see `docs/research-brief-caching-and-email-concurrency.md`.

### Batch 5 — GameChanger hidden-tab polling fix (live-tournament-sensitive)
**Fixes:** R3.
**Why isolated:** highest "wrong fix breaks something during a live event" risk on
the list. Existing idle-detection (stop polling when no live games) already works
correctly — the fix must gate `runPollLoop`/`schedule` on
`document.visibilityState` without disturbing that, and must resume correctly on
refocus (including the case where games went live while the tab was hidden).
**Risk:** Medium-high, specifically because this code path is only really stressed
during an actual live event — a subtle regression may not surface until the next
one, in production, on a publicly/board-visible page.
**Sequencing:** Its own PR; land in a window between live tournament days; smoke-test
manually (background a tab 2+ minutes, confirm poll pauses via network tab,
refocus, confirm it resumes and catches up) before the next live event. Don't
bundle with F3/Batch 11 even though both are "hooks/components" — this is a
behavior/correctness change to a live-data loop, not a pure render-perf change.
**Research first:** No — standard visibility-gating pattern, existing `onVisibility`
scaffolding to extend.

### Batch 6 — `lib/allStar/auth.ts` N+1 + correctness pass (auth-sensitive)
**Fixes:** L1.
**Why isolated:** gates 14+ routes and runs on nearly every All-Star admin
request — it's an auth-boundary function, not just a hot path. In practice today
this is usually 0-1 rows per admin+org, so the perf win is modest; the priority is
correctness — any refactor (e.g. collapsing to one query) must preserve the exact
"first row that satisfies the permission check wins" semantics, including the
`hasImplicitAllStarFullAccess` fallback's separate `AdminUser` lookup.
**Risk:** High for auth correctness even though the perf gain is small — an
incorrect collapse could silently over- or under-grant vault access across org
boundaries.
**Sequencing:** Standalone PR. Write/extend regression tests first (master admin,
Full Access user, Limited Admin view-only, Limited Admin post-all-ballots, no
access, implicit-full-access fallback — across at least 2 orgs) before refactoring,
not after. Land well outside any active voting/ballot window.
**Research first:** No, but write tests for current behavior before changing code.

### Batch 7 — `lib/communications/sender.ts` concurrency
**Fixes:** L2.
**Why split:** two independent problems in one function — (a) suppression check
should be a single `findMany` pre-fetch [quick win], (b) no concurrency limit on
outbound Resend calls [design decision: pick a concurrency limit and/or a
batch-send API, informed by Resend's actual rate limits].
**Risk:** Medium. Feature-flagged (`COMMUNICATIONS_MODULE_ENABLED`), so blast radius
is contained, but a wrong concurrency choice could still hit serverless timeout or
trip Resend rate limits. A concurrent version must preserve the current
per-recipient failure isolation (one bad email shouldn't fail the batch).
**Sequencing:** Two commits in one PR — commit 1 (suppression pre-fetch) ships
immediately; commit 2 (concurrency) waits on the research brief.
**Research first:** YES for the concurrency half — see research brief.

### Batch 8 — GameChanger hook dedup + admin dashboard N+1
**Fixes:** R8, F10.
**Why grouped:** both are "do it once, reuse" cleanups, not urgent alone.
**Risk:** Low-medium.
**Sequencing:** After batch 5 lands and is proven stable through at least one live
event — extract the shared polling primitive then, so the visibility fix isn't
implemented twice. Keep "behavior fix" (batch 5) and "code dedup" (this batch) as
separate, independently revertable commits.
**Research first:** No.

### Batch 9 — Bundle-size quick win
**Fixes:** F2, F7, F8, F13.
**Why grouped:** identical mechanical fix (`import()` inside the handler instead of
top-level), with working in-repo templates already established.
**Risk:** Low — just verify each dynamic-imported module is awaited before use.
**Sequencing:** Can ship alongside batch 1 (both are public-homepage perf, both
trivially safe) — consider bundling into the same PR to minimize preview-triggering
pushes.
**Research first:** No.

### Batch 10 — `DugoutTimeline.tsx` decomposition + memoization
**Fixes:** F1, F5, F6.
**Why isolated:** the largest single file touched (3406 lines) — a mechanical
"wrap everything in memo" pass risks stale-closure bugs if done hastily.
**Risk:** Medium-high for regression on the org's day-to-day user-facing surface —
recommend extracting one render function at a time (e.g. `renderComment` first),
shipping/verifying each before the next.
**Sequencing:** After the mechanical batches (1-3, 9) and the auth/live-sensitive
batches (5, 6) are stable — least time-pressured, highest effort/risk-of-subtle-bug
item. Land as 2-4 sequential small PRs, not one.
**Research first:** No, but sketch prop boundaries for each extracted subcomponent
before touching code.

### Batch 11 — Bracket slot-resolution memoization (live-tournament-sensitive)
**Fixes:** F3.
**Why isolated:** same sensitivity class as batch 5 — a wrong `useMemo` dependency
array here is worse than the current bug (could show a stale bracket during a live
game — a correctness regression, not just perf).
**Risk:** Medium-high. Test plan: replay/simulate `liveGameStatuses` updates against
a real bracket spec (win/loss flips affecting downstream slots) and confirm the
memoized version re-derives on every status change that matters, skips on ones that
don't.
**Sequencing:** Same low-traffic window as batch 5; keep as a separate commit/PR
(different fix class — hook behavior vs. component render).
**Research first:** No, but enumerate which status-field changes must invalidate
which slot computations before merging — this is the one place "just add
`useMemo`" isn't automatically safe.

### Batch 12 — Schema index additions
**Fixes:** L10.
**Why isolated:** additive-only migration (new indexes, no column/table changes),
independent of all app-code batches, but has its own dev-then-prod migration
promotion lifecycle per `CLAUDE.md`.
**Risk:** Low (additive indexes don't change query results).
**Sequencing:** Can happen anytime, in parallel with everything else. Bundle all 4
index additions into one migration file (one review, one dev-verify pass, one prod
promotion) rather than 4 separate migrations.
**Research first:** No.

---

## Suggested push/PR boundaries

1. **Push 1:** Batch 1 + Batch 9 (public homepage latency + bundle size)
2. **Push 2:** Batch 2 + Batch 3 (admin N+1 cleanups)
3. **Push 3:** Batch 4, once caching-primitive research is back
4. **Push 4:** Batch 7 commit 1 only (suppression pre-fetch); hold commit 2 for its
   own push once Resend research is back
5. **Push 5:** Batch 6 (`lib/allStar/auth.ts`), timed outside any active voting
   window, tests added first
6. **Push 6:** Batch 5 (GameChanger visibility fix), timed between live tournament
   days
7. **Push 7:** Batch 11 (bracket memoization), same low-traffic window as push 6,
   separate commit
8. **Push 8+:** Batch 10 (`DugoutTimeline` decomposition), split into 2-4
   incremental small PRs
- **Independent track:** Batch 12 (index migration) on its own dev→prod schedule
- **Independent track:** Batch 8 (hook consolidation + admin dashboard N+1) after
  push 6 is proven stable

**Auth/live-event sensitive — never bundle with anything else:** batches 5, 6, 11.

## Not yet actioned

- A `review-<topic>.md` handoff for Codex is intentionally not written yet — that's
  a follow-up once specific batches above are actually implemented, so there's a
  real diff to review.
- No git commits were made to this repo as part of this audit — these two docs are
  reference material only.
