# Research brief: caching primitive + email-send concurrency

**Requested by:** claude (command center) — see `docs/efficiency-audit-2026-08.md`
batches 4 and 7 for full context.
**For:** agy (Antigravity) — researcher role per `ROLES.md`.
**Output format:** options, tradeoffs, recommendation, and links, appended to this
file or as a reply doc — whichever this repo's workflow prefers.

Two of the twelve refactor batches in the efficiency audit are blocked on external
verification before an implementation approach should be chosen. Both are flagged
"needs research first" rather than "just implement it" because a wrong choice here
would need to be redone across multiple files, not just one.

## Question 1 — Next.js 16 caching primitive

**Context:** Zero usage of `unstable_cache` or `React.cache` exists anywhere in
`lib/` today (verified via grep across the whole directory). Several public pages
(`app/news/page.tsx`, `app/park-info/page.tsx`, `app/rosters/page.tsx`,
`app/standings/page.tsx`) use `export const dynamic = "force-dynamic"` and re-read
the database (and, for park-info, re-parse markdown) on every single request, even
though the underlying content changes on the order of days, not seconds.

This project runs **Next.js 16** (`package.json`: `"next": "16.2.3"`), and its own
`CLAUDE.md` explicitly warns: *"This project uses Next.js 16 with breaking changes
from older versions. Heed deprecation notices — conventions and APIs may differ
from training data."* `unstable_cache` is the Next 14/15-era caching primitive for
Server Components; Next 16 has been moving toward a `"use cache"` directive with
`cacheLife()`/`cacheTag()` under the `dynamicIO` flag.

**Please confirm:**
1. Is `"use cache"` + `cacheLife`/`cacheTag` (under `dynamicIO`) the currently
   recommended replacement for `unstable_cache` in Next.js 16 Server Components?
   Or is `unstable_cache` still supported/recommended as of 16.2.x?
2. Does this project's `next.config.ts` need `dynamicIO` (or an equivalent flag)
   enabled to use `"use cache"`, and if so, are there known interaction issues with
   `force-dynamic` pages that need to *stop* being force-dynamic?
3. **Multi-tenant build interaction:** this codebase builds the same code as 3+
   separate Vercel deployments selected by the `SITE_ORG` env var at build/runtime
   (`gonzales`, `ascension`, `master`, plus `fallball`/`ladistrict2`/`ladistrict6`).
   Confirm the chosen caching primitive's cache keys are scoped correctly so cached
   data from one org's build can never leak into another org's output (each org is
   a genuinely separate deployment/build, but the same source calls the same cache
   functions — verify there's no shared build-time cache artifact risk).
4. Check `node_modules/next/dist/docs/` directly in this checkout (per this repo's
   own `CLAUDE.md` instruction) rather than relying on general Next.js knowledge,
   since 16.x conventions may not match training data.

**Where this feeds back:** batch 4 of the refactor roadmap (caching strategy
overhaul) — the recommendation here becomes the one pattern applied across
`app/news/page.tsx`, `app/park-info/page.tsx`, `app/rosters/page.tsx`,
`app/standings/page.tsx`, and eventually the systemic "no request-level
memoization in `lib/`" gap (admin session lookups, org config, vault-access role
checks).

## Question 2 — Resend rate limits / batch-send API

**Context:** `lib/communications/sender.ts`'s `sendCampaignEmails` (lines 16-129)
sends campaign emails fully sequentially: for each recipient, it awaits a DB
suppression check, then an external Resend API call, then a DB delivery-record
write — one recipient at a time, no concurrency, no pre-fetch of all suppressions.
For a large campaign (hundreds/thousands of recipients) this is O(n) sequential
round trips to both Postgres and Resend, with real risk of hitting the serverless
function's `maxDuration` before the campaign finishes sending.

**Please confirm:**
1. Does Resend offer a bulk/batch send endpoint (send many emails in one API call)
   suitable for a campaign-style send, as opposed to one API call per recipient?
2. What are the practical rate limits for this project's Resend account tier
   (requests/second, daily volume caps)?
3. Given Vercel serverless `maxDuration` constraints, is raising inline concurrency
   (e.g. a `p-limit`-style cap of 5-10 concurrent sends) sufficient for realistic
   campaign sizes in this project, or should large campaigns instead be chunked
   across multiple invocations (a queue, a cron-triggered continuation, or similar)
   rather than handled in one request?
4. If a concurrency limit is the right call: what's a safe default given Resend's
   limits, and does it need to be configurable per-org (env var) rather than
   hardcoded?

**Where this feeds back:** batch 7 of the refactor roadmap — specifically the
second commit (concurrency-limited sending), which is intentionally withheld from
implementation until this is answered. The first commit (suppression pre-fetch, a
pure mechanical N+1 fix) does not depend on this research and can ship
independently.

---

Once answered, fold the findings back into `docs/efficiency-audit-2026-08.md`
batches 4 and 7 (update the "Research first" notes with the resolved approach)
before either batch is implemented.
