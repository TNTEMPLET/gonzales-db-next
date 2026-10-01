# AP Baseball admin audit — October 2026

Read-only audit of what the admin side of `TNTEMPLET/gonzales-db-next` actually does today. Baseline is `origin/main` at `006f89b` (“Show Total Pay at the top of umpire reports.”), checked out on branch `docs/admin-audit`. The shared `preview` working tree was not used. No database was queried, so “how often” is judged from code, routes, crons, and git history, not from live row counts.

This is a description of the product, not a design and not an implementation plan.

---

## 1. What this project is

AP Baseball is one Next.js app that runs the public websites and the back office for Ascension Parish youth baseball. `SITE_ORG` picks the deployment: Gonzales Diamond Baseball (`gonzales`, dyb.apbaseball.com), Ascension Little League (`ascension`, llb.apbaseball.com), AP Fall Ball (`fallball`, fallball.apbaseball.com), the cross-org control plane (`master`, admin.apbaseball.com), and two tournament-only sites, Louisiana District 2 Little League (`ladistrict2`) and Louisiana DYB District 6 (`ladistrict6`). It started as a way to publish each org’s public site. It is now the league operating system: registration import, teams and drafts, the season scheduler, scores and standings, umpire assignment, rainouts, tournament brackets, email, PayPal orders, all-star voting, a coach social feed, volunteer compliance, and parish reports. Families and coaches use the public site and Coach Corner. Board members, org admins, and park directors use `/admin`. Master admins use admin.apbaseball.com to work across orgs with an `?org=` switcher.

---

## 2. Module inventory

Roles are `MASTER_ADMIN`, `ADMIN`, `BOARD_MEMBER`, and `PARK_DIRECTOR` (`lib/auth/adminRoles.ts`). “Who uses it” is the minimum role on the module gate. Several pages have no module of their own and borrow a neighbor’s gate. Fall Ball hides `ALL_STAR_VAULT`, `ALL_STAR_PAYMENTS`, `SPONSORS`, and `TOURNAMENT_BRACKETS` (`lib/org/capabilities.ts`). Modules marked master-only are refused on an org deployment unless the signed-in user is a master (`MASTER_ONLY_MODULES` in `lib/auth/adminRoles.ts`).

Maturity: **solid** = real workflow, auth, and data model, touched in 2026. **partial** = works but thin, mis-gated, or labeled temporary. **stub** = prototype or redirect. **dead** = no live caller, or only a redirect.

| Module | What it does | Who | How alive | Data models | Maturity |
|---|---|---|---|---|---|
| Dashboard `/admin` | Org switcher, “state of the org” charts for board+, game-day panel and park-director menu otherwise, module cards | `PARK_DIRECTOR`+ | Daily in season. Cards and in-season board updated through Sep 2026 | Reads `Enrollment`, `Survey`, `OrgAlert`, schedule, Assignr, orders | **solid**, bloated |
| Directory `/admin/users` | Accounts, coach flags, duplicate merge, CSV import, bulk email | `ADMIN` (`USERS`) | Core people system. Page split out 2026-08-31 | `RegisteredUser`, `RegisteredUserOrgProfile`, `RegisteredUserDuplicateCandidate`, `AdminUser` | **solid** |
| Volunteer cards `/admin/volunteers` | JDP background checks, Abuse Awareness, role readiness. Public card at `/volunteer-card` | `ADMIN` (`VOLUNTEERS`) | Seasonal compliance. Still linked from reports | `VolunteerProfile`, `VolunteerRoleDef`, `VolunteerRoleAssignment`, `VolunteerRequirementDef`, `VolunteerRequirementStatus` | **solid** |
| Role assignment `/admin/roles` | Grant, change, revoke per-org admin roles. Least-privilege hints | `MASTER_ADMIN` only, master-only module | Rare, structural | `AdminUser`, `AdminOrgMembership` | **solid** |
| Coaching interest `/admin/coaching-interest` | Queue for the public `/coaching-interest` form | `ADMIN` via `TEAMS`, and only if `isCoachingInterestEnabled` (Gonzales, Ascension, Fall Ball) | Enabled for all three content orgs 2026-09-01 | `CoachingInterestSubmission` | **solid** |
| Season setup `/admin/season-setup` | Checklist: registration, coaches, draft vs direct import, jerseys, schedule. Fall Ball umpire-pay rates live on the settings API | `PARK_DIRECTOR` (`SEASON_SETUP`) | Active Sep 2026 (umpire pay editor) | `SeasonSetupChecklistItem`, `SeasonOrgSettings` | **solid** |
| Teams & rosters `/admin/teams` | Rosters, coach assignment, jersey numbers, equipment checkout, smart auto-build, SportsConnect assist | `ADMIN` (`TEAMS`) | Core. `AdminTeamsManager.tsx` is ~4,160 lines | `Team`, `TeamPlayer`, `TeamCoachAssignment`, `EquipmentCheckout`, `TeamPlayerImportBatch`, `TeamAllStarAgeCutoff`, `CoachImportBatch`, `TeamListImportBatch` | **solid** |
| Import registration `/admin/sports-connect` | Upload SportsConnect exports, presets, quality, collisions, run history. Drive sync is the cron | Shown if any competition module is allowed (no own module) | Seasonal plus cron every 2 hours. Lib touched 2026-08-31 | `SportsConnectMappingPreset`, `SportsConnectImportRun`, `SportsConnectOrgDriveFolder`, `Enrollment`, `PlayerNameCollisionReview` | **solid** |
| Enrollment & KPIs `/admin/enrollment` | Counts, collected vs outstanding, fee tiers, team fill | `BOARD_MEMBER` (`ENROLLMENT_KPI`) | Parish packet work Sep 2026 | `Enrollment` | **solid** |
| Online draft `/admin/draft` | Live draft room, protections, coach invites, materialize to teams, SportsConnect export. Coaches pick at `/coach-corner/draft` | `ADMIN` (`DRAFT`) | Seasonal window. Wired into the hub 2026-08-28 | `DraftSession`, `DraftTeam`, `DraftPlayerPool`, `DraftPick`, `CoachPlayerProtection` | **solid** |
| Scores & standings `/admin/scores` | Enter finals on the local posted schedule, CSV import, GameChanger preview/import. Public standings read `GameScore` | `PARK_DIRECTOR` (`SCORES`) | Rebuilt onto the local schedule 2026-09-22 | `GameScore`, `GameChangerScoreboardConnection` | **solid** |
| Scheduler `/admin/scheduler` | Seasons, parks, fields, availability, generate, practice slots, export workbook, email coaches and park directors | Shown with competition modules; in-season links require `TEAMS` | Heaviest area in Sep 2026 (wizard, Fall Ball, notify) | `ScheduleSeason`, `SchedulePark`, `ScheduleField`, `ScheduleFieldAvailability`, `ScheduleDivisionRule`, `ScheduleDraftGame`, `TeamPracticeSlot` | **solid** |
| Umpire desk `/admin/assignr` | Sync games, officials, assignments, pay statements. Subpages `/assignments`, `/officials`, `/pay` | `ADMIN` (`ASSIGNR`) | In-season ops. League ids are per org in `lib/siteConfig.ts` | `AssignrSyncJob`, `AssignrAuditLog` (games themselves stay in Assignr) | **solid** |
| Registration windows `/admin/registration` | Open/close dates for public `/registration` | `MASTER_ADMIN`, master-only | A few times a year | `OrgRegistrationWindow` | **solid**, thin |
| Tournament brackets `/admin/tournament-brackets` | Build, seed, publish brackets; GameChanger widget mapping and live sync; PDF/OCR ingest | `MASTER_ADMIN`, master-only | Tournament season. Client is ~3,300 lines. Public `/tournaments` and `/today` | `BracketProject`, `GoverningBodyTemplate` | **solid** |
| Park & tournament alerts `/admin/alerts` | Manual and automatic rainouts (`OrgAlert`) plus tournament-monitor subscriptions | Park alerts: `ADMIN`. Tournament alerts: `MASTER_ADMIN` | Weather days. Homepage reads the active alert | `OrgAlert`, `TournamentMonitorSubscription`, `TournamentMonitorRun`, `TournamentMonitorEvent` | **solid** |
| Park info `/admin/park-info` | Rules, parking, field maps for public `/park-info` | `ADMIN` minimum, but master-only module | Occasional | `ParkInfoPage` | **solid** |
| Communications `/admin/communications` | Resend campaigns, audiences, approval, schedule/send, from-addresses, unsubscribe | `ADMIN` (`COMMUNICATIONS`). Kill switch `COMMUNICATIONS_MODULE_ENABLED` | Used as the league email desk. Division audiences landed 2026-09-11 | `CommunicationCampaign`, `CommunicationFromAddress`, `CommunicationAudienceRule`, `CommunicationApproval`, `CommunicationRecipientSnapshot`, `CommunicationDelivery`, `EmailSuppression` | **solid** |
| News `/admin/news` | Draft and publish stories for `/news` and homepage rotator | `BOARD_MEMBER`, master-only | Steady CMS | `NewsPost`, `NewsPostMedia` | **solid** |
| Social `/admin/social` | Compose, sync, publish to the Facebook Page | `BOARD_MEMBER`, master-only | Real API routes; depends on Meta tokens | `SocialPost` | **partial** (external account dependency, smaller surface) |
| Dugout moderation `/admin/dugout` | Moderate the coach/parent feed | `BOARD_MEMBER` | Feed is a large product (`DugoutTimeline.tsx` ~3,740 lines). Admin panel is the moderation slice | `DugoutPost`, `DugoutComment`, `DugoutPostLike`, `DugoutNotificationCursor`, `DugoutNotificationRead` | **solid** |
| Org documents `/admin/documents` | Shared Google Drive folder embed and file permissions | `BOARD_MEMBER`, master-only | Convenience, not a document system | Drive folder config (`AP_GOOGLE_DRIVE_FOLDER_URL` and Drive service account). Not a Prisma document model | **partial** |
| Surveys `/admin/surveys` | Build surveys, read results, board-contact requests. Public `/surveys/[slug]` | Gated as `TEAMS` (`ADMIN`), even though the Sep 18 desk was described for park directors | Rebuilt 2026-09-18 | `Survey`, `SurveySection`, `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer` | **solid**, gate is wrong for the stated user |
| Cap orders `/admin/cap-orders` | Fulfill parent cap orders from PayPal | Sidebar shows this if `SPONSORS` **or** `REPORTS` | All-star season. Webhook + admin | `CapOrderRecord`, `CapOrderItem` | **solid** |
| Shirt orders `/admin/shirt-orders` | Championship shirt orders | Same borrowed gate as caps | All-star season. Webhook plus 10-minute cron | `ShirtOrderRecord`, `ShirtOrderItem` | **solid** |
| Sponsors `/admin/sponsors` | Packages, logos, footer scroller. Can send email | `ADMIN` minimum, master-only module | Gonzales and Ascension. Hidden for Fall Ball | `Sponsor`, `SponsorPlacement`, `SponsorPackageEnrollment` | **solid** |
| Reports `/admin/reports` | Hub of parish field prep, parish enrollment, umpire pay, tournament income, plus links into enrollment, jerseys, schedule export, volunteer export | Any role that can open at least one card. Park directors get `REPORTS` | Very active Sep 2026. `reports.apbaseball.com` rewrites `/` to this page (`proxy.ts`) | Mix of schedule, enrollment, PayPal, Assignr | **solid** |
| Umpire pay `/admin/reports/umpire-pay` | Payout summaries, Fall Ball rate editor, email to treasurer | `REPORTS` (`PARK_DIRECTOR`+) | Hottest file in late Sep 2026, including same-day park pay on the dashboard | `SeasonOrgSettings` plus Assignr/schedule rows | **solid** |
| Tournament income `/admin/reports/tournament-income` | District PayPal tournament payments, classify, export | `REPORTS` | Tournament season | `TournamentIncomeTransaction` | **solid** |
| Parish reports `/admin/reports/parish-enrollment`, `/admin/reports/parish-field-prep` | Income PDF/CSV for the parish, and which fields to prep | Enrollment: `ENROLLMENT_KPI`. Field prep: `TEAMS` | Sep 2026 | `Enrollment`, `ScheduleDraftGame` | **solid** |
| All-Star vault `/admin/all-star` | Cycles, ballots, invites, votes, final rosters, payments, PayPal CSV, exports. Subpages `/setup` and `/cycle-management` | `ADMIN` plus vault ACL (`FULL_ACCESS` / `LIMITED_ADMIN`). Fall Ball off | Seasonal spike. `AllStarVaultManager.tsx` is ~5,576 lines | `AllStarBallotCycle`, `AllStarCandidate`, `AllStarInvite`, `AllStarVoteDraft`, `AllStarVoteSubmission`, `AllStarVoteItem`, `AllStarHeadCoachAssignment`, `AllStarVaultAccess`, `AllStarAuditLog`, `AllStarPageConfig`, `AllStarPayment` | **solid**, too big for one screen |
| Travel desk `/admin/travel` | All-star trip parent intake, roster import, Sheet CSV. Public `/trip/[token]` | Same vault gate | Event-based | `TripEvent`, `TripParticipant`, `TripResponse`, `TripFieldTemplate`, `TripFieldDef` | **solid** |
| Field desk `/admin/field-desk` | Check scoreboard controllers in and out, show crews where they are, copy games onto umpire cards | `PARK_DIRECTOR`+ by an explicit role check, not a module | Added 2026-09-24. Not in the sidebar | Checkout columns on `ScheduleDraftGame` (`scoreboardCheckedOutAt`, `scoreboardCheckoutName`, side). Posted statuses `LOCKED` and `EXPORTED` | **solid**, hard to find |
| Game day | Rainout set/clear on the dashboard, not its own URL | Park-director dashboard | Added with field desk, 2026-09-24 | `OrgAlert` via `app/admin/game-day/actions.ts` | **partial** (panel + actions, no page) |
| Merch shop `/admin/shop` → `/admin/shop/test-order` | “Prototype structured shirt order form.” Public `/shop` sells `MerchProduct` through PayPal | All-Star program nav only. Not in the sidebar | Page copy still says prototype | `MerchProduct`, `MerchProductStatus`, `MerchOrderDraft` | **partial** |
| Legacy hubs `/admin/people`, `/competition`, `/park`, `/publishing`, `/orders` | Redirect old `?tab=` / `?section=` URLs to the split pages | — | Left behind on 2026-08-31 when hubs were split | — | **stub** (redirects) |
| `/admin/payments` | Redirects to `/admin/all-star` | — | Last touched 2026-08-29 | — | **dead** as a page |
| `/admin/tournament-alerts` | Redirects to `/admin/alerts` | — | Alias from the hub split | — | **stub** |
| `/news/admin` | Second news editor, same `NewsAdminPanel` | `NEWS_ADMIN` | Still a real page, not linked from the sidebar | `NewsPost` | **solid** duplicate |
| Coach Corner `/coach-corner` | Coach schedule, roster cards, game notes, draft room, abuse-awareness upload | Team coaches (`CoachSession`), not an admin role | Separate product surface coaches actually use | `CoachSession`, `Team`, `TeamPlayer`, `TeamGameNote` | **solid**, outside `/admin` |
| Dugout `/dugout` | The feed itself (posts, comments, likes, Google or local login) | Registered users | Public product with an admin moderation page | Dugout models above | **solid** |
| Tournament roster intake `/admin` API + `/tournament-rosters/[token]` | Token link for visiting teams to submit rosters | Bracket operators | Used by district/tournament sites | `TournamentRosterIntakeLink`, `TournamentRosterSubmission`, `TournamentRosterSubmissionPlayer` | **solid**, easy to miss (no sidebar leaf) |

Server mutations are almost all route handlers under `app/api/admin/**`. The only server-action files are `app/admin/alerts/actions.ts`, `app/admin/field-desk/actions.ts`, and `app/admin/game-day/actions.ts`.

### Models that look unused in application code

| Model | Evidence |
|---|---|
| `SmsConsent` | Declared on `RegisteredUser` in `prisma/schema.prisma`. No TypeScript caller. SMS send path exists but defaults off. |
| `ScheduleExportBatch` | Status enum and relation exist. No TypeScript caller. Scheduler export writes files, not this table. |

`AllStarVoteItem` and `SponsorPackageEnrollment` are used (`app/api/all-star/vote/submit/route.ts`, `app/api/admin/sponsors/[id]/route.ts`). They are not dead.

---

## 3. User roles and their main workflows

Authority rank is Master (5) > Admin (4) > Board (3) > Park director (2). Source of truth for a non-master is `AdminOrgMembership` for that org. `AdminUser.role` is legacy display only; `syncAdminUserAggregateRole` is a no-op (`lib/auth/effectiveAdminRole.ts`). Masters (`AdminUser.isMaster`) are `MASTER_ADMIN` on every org. `PROTECTED_MASTER_ADMIN_EMAIL` is hard-coded in `lib/auth/adminRoles.ts`.

Login is email/password and Google (`app/admin/login/page.tsx`, `app/api/auth/google/route.ts`). Google sign-in also upserts a `RegisteredUser` so the same person can exist as an admin and as a dugout/all-star user.

**Master admin** (admin.apbaseball.com, or a master signed into any deployment)

- Switch `?org=` among Gonzales, Ascension, and Fall Ball. “All sites” is for reading, not for writes (`docs/admin-module-workflow-pattern.md`).
- Assign roles (`/admin/roles`). Only this role can assign `BOARD_MEMBER` and `PARK_DIRECTOR` (`isAssignableOnlyOnMasterSite`).
- Open registration windows, build and publish brackets, run tournament alerts, and use the master-only publishing modules (news, social, documents, sponsors, park info).
- Preview the UI as another role or as a specific user. Preview is `sessionStorage` plus dashboard filtering (`components/admin/AdminRolePreviewControl.tsx`). API routes still check the real session.
- Run cross-org all-star payment summaries and the Fall Ball daily capacity email.

**Org admin** (`ADMIN` on one content org)

- Day-to-day league work: directory, volunteers, coaching-interest queue, teams, draft, SportsConnect import, scheduler, Assignr, communications, park rainouts.
- On an org deployment (not `SITE_ORG=master`), master-only modules stay closed even if the rank would allow them. A Gonzales admin on dyb.apbaseball.com does not get brackets, news, sponsors, or role assignment.

**Board member**

- Everything a park director can do, plus dugout moderation, and (on the master deployment) news, social, and documents.
- Enrollment KPIs and the dashboard “state of the org” (registration, compliance, engagement, needs-attention). Park directors do not get that board.
- All-star payment oversight (`ALL_STAR_PAYMENTS` minimum is board). The vault itself is admin / vault-access.

**Park director**

- The game-day job, when the season is live: rainout on the dashboard (`GameDayPanel`), field desk (controllers, crew list, umpire cards), enter scores, same-day umpire pay for one park (`components/admin/dashboard/ParkDirectorMenu.tsx`).
- Season setup, and the reports their module allows (umpire pay). They do not get teams, scheduler, directory, or communications.
- Surveys are the mismatch: the desk was rebuilt “so park directors can run it” (2026-09-18) but `/admin/surveys` still requires `TEAMS`, which is admin-only.

**All-star vault roles** (not `AdminRole`)

- `AllStarVaultRole`: `FULL_ACCESS` (manage cycles, ballots, invites) and `LIMITED_ADMIN` (read). Stored on `AllStarVaultAccess`, matched by admin email to a `RegisteredUser` in that org (`lib/allStar/auth.ts`).
- Masters pass. A non-master is not given vault access just because `AdminUser.role` says admin.

**Coaches**

- `TeamCoachRole`: `HEAD_COACH` or `ASSISTANT_COACH` on `TeamCoachAssignment`.
- They use Coach Corner and the draft room, not `/admin`, unless someone also gives them an admin membership or vault access.
- Public coach pipeline: `/coaching-interest` → admin queue.

**Parents and the public**

- Browse schedule, standings, news, park info, brackets, sponsors, registration, shop (members-only), surveys, all-star vote, trip form, tournament roster form, volunteer card, dugout.
- Dugout identity is a `RegisteredUser` (Google or local password), separate from `AdminUser`.

**Tournament-only sites** (District 2 and District 6)

- Public home is brackets (`tournamentOnly` in `lib/siteConfig.ts`). League nav is hidden.
- District 2 is the org on the bracket GameChanger cron. District 6 is called out in the tournament-income report copy.

---

## 4. Information architecture today

The sidebar is built in `lib/admin/sidebarNav.ts` from the same six categories as the dashboard cards (`lib/admin/dashboardModules.ts`). Two groups:

**Operations**

- People & Access — Directory, Volunteer Cards, Role Assignment, Coaching Interest
- Competition & Play — Season Setup, Teams & Rosters, Import Registration Data, Enrollment & KPIs, Online Draft, Scores & Standings, Scheduler, Umpire Desk (Assignr), Registration Windows
- Park & Tournaments — Tournament Brackets, Park & Tournament Alerts, Park Info

**Program & Commerce**

- Publishing & Comms — Communications, News Publishing, Social Media, Dugout Moderation, Org Documents, Surveys
- Orders & Commerce — Cap Orders, Shirt Orders, Sponsors, Umpire Pay, Reports
- All-Star Program — All-Star Vault, Travel Desk

What you see depends on role and on `?org=` capabilities. Until `/api/admin/me` returns, the sidebar treats every module as allowed (`allowModule` returns true when `masterRole` is null in `components/admin/AdminSidebar.tsx`).

### Where it is confusing, duplicated, or bloated

- **Hubs were split, then left in the front door.** On 2026-08-31 the people, competition, park, publishing, and orders hubs became real pages. The dashboard cards still link to `/admin/people`, `/admin/competition`, `/admin/park`, `/admin/publishing`, and `/admin/orders`, which only redirect. Card copy still says “hub” and “one place.”
- **The park director’s desk is not in the menu.** Field desk and game-day rainout are how that role works. Neither is a sidebar leaf. They are reached from the dashboard checklist.
- **Surveys sit under Publishing and are gated like Teams.** A board member who can moderate dugout cannot open surveys. A park director who was the stated user cannot either.
- **Sports Connect and Scheduler have no module key.** They appear whenever any competition module is visible, so a park director who only has scores does not see them in the sidebar (good) but the gate is an OR of five modules, not a named job.
- **Orders borrow Sponsors or Reports.** Cap orders and shirt orders show up for anyone with `REPORTS`, including park directors, and also under the All-Star stage nav (`components/admin/allStar/AllStarProgramNav.tsx`) next to a “Shop” link that is the merch prototype.
- **Umpire money appears three times:** Assignr pay (`/admin/assignr/pay`), umpire pay report (`/admin/reports/umpire-pay`), and the park-director day pay on the dashboard.
- **News has two editors:** `/admin/news` (sidebar) and `/news/admin` (same panel, not in the sidebar).
- **All-star is a second app inside the shell.** Vault, payments, caps, shirts, shop prototype, and travel are one seasonal program spread across Orders, Publishing, and All-Star.
- **Master-only vs role-minimum is hard to see.** Park info’s minimum role is admin, but the module is also master-deployment-only. The sidebar and the role-assignment helper do not tell the same story.
- **A few giant screens are the IA.** Teams (~4,160 lines), scheduler (~3,460), brackets (~3,300), vault (~5,576), and the dugout timeline (~3,740) are where “one page” became the whole workflow.

---

## 5. Dead, duplicate, or half-built

### Root folders that mirror `lib/` and are not imported

`tsconfig.json` maps `@/*` to the repo root, so both `@/lib/auth` and `@/auth` would resolve. Nothing outside these folders imports the root copies. Live code uses `@/lib/...`. Several copies have drifted, so editing the root file does nothing and can lie about the code.

| Root folder | Same files as `lib/` | Differ | Only in `lib/` | External `@/folder` imports |
|---|---|---|---|---|
| `admin/` | 11 | 3 | 57 | 0 |
| `auth/` | 8 | 2 | 0 | 0 |
| `communications/` | 11 | 6 | 3 | 0 |
| `draft/` | 3 | 4 | 4 | 0 |
| `scheduler/` | 1 | 4 | 43 | 0 |
| `sportsConnect/` | 25 | 1 | 4 | 0 |
| `gamechanger/` | 37 | 1 | 0 | 0 |
| `allStar/`, `assignr/`, `dugout/`, `merch/`, `news/`, `paypal/`, `social/`, `sponsors/`, `tournament-brackets/`, `tournament-income/`, `tournament-monitor/`, `tournament-rosters/`, `trip/`, `volunteers/`, `coachCorner/`, `google/`, `players/` | mostly identical | a few | tests and newer files | 0 |

Also unused as import roots: `privacy/`, `org/`, `export/`, `api/` at the repo root (the live ones are under `lib/`).

### Routes that only redirect

- `app/admin/people/page.tsx` → users, volunteers, coaching-interest, or roles
- `app/admin/competition/page.tsx` → teams, sports-connect, enrollment, draft, scores, scheduler, assignr, or registration
- `app/admin/park/page.tsx` → brackets, alerts, or park-info
- `app/admin/publishing/page.tsx` → communications, news, social, dugout, or documents
- `app/admin/orders/page.tsx` → cap orders, shirt orders, sponsors, or reports
- `app/admin/payments/page.tsx` → `/admin/all-star`
- `app/admin/shop/page.tsx` → `/admin/shop/test-order`
- `app/admin/tournament-alerts/page.tsx` → `/admin/alerts`

### Half-built or stranded

- `app/admin/shop/test-order/page.tsx` calls itself a prototype. The public shop (`app/shop/page.tsx`) is a real PayPal storefront when the org has SKUs. There is no catalog admin in the sidebar.
- `app/admin/game-day/` has actions and no page. The UI is `components/admin/dashboard/GameDayPanel.tsx`.
- SMS: `lib/communications/providers/twilio.ts` refuses to send unless `COMMUNICATIONS_SMS_ENABLED` is true (default false). `SmsConsent` is unused.
- Schedule Manager cron (`app/api/cron/schedule-manager/route.ts`) always runs `DRY_RUN`. Live GameChanger game creation happens only after a bracket game goes final, via `app/api/cron/bracket-gamechanger-sync`.
- `app/sample-player-card/page.tsx` and `app/sample-sponsor-scroller/page.tsx` are sample pages, not admin.
- Tournament roster intake and the merch test order are real and absent from the sidebar.
- `app/api/token/route.ts` returns an Assignr access token to any caller who passes the `ASSIGNR` module check. It is an admin credential proxy, not a public token endpoint.

---

## 6. Integrations and external dependencies

Env names only. No values.

| Service | Purpose | Env names | Trigger | Risk |
|---|---|---|---|---|
| Postgres | All admin and public data | `DATABASE_URL`, `SHADOW_DATABASE_URL` | Every request | Single database for every org deployment. Org id is an application filter, not a separate database. |
| Resend | Campaign email and the Fall Ball daily capacity report | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `COMMUNICATIONS_EMAIL_FROM`, `COMMUNICATIONS_EMAIL_FROM_OPTIONS`, `COMMUNICATIONS_UNSUBSCRIBE_SECRET`, `COMMUNICATIONS_MODULE_ENABLED` | Admin send, and cron `fallball-daily-report` daily at 12:00 UTC | Sends are sequential per recipient (`lib/communications/sender.ts`). A large campaign can time out. Module can be switched off. |
| Twilio | Tournament / communications SMS | `COMMUNICATIONS_SMS_ENABLED`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE` | Only if the flag is on. Tournament monitor checks the three Twilio vars before texting (`lib/tournament-monitor/alertSender.ts`) | Off by default. Consent table is unused, so turning the flag on has no consent record. |
| Assignr | Umpires, assignments, pay statements. League id per org (Gonzales, Ascension, Fall Ball) | `ASSIGNR_CLIENT_ID`, `ASSIGNR_CLIENT_SECRET`, `ASSIGNR_API_BASE`, `ASSIGNR_TOKEN_BASE`, `ASSIGNR_OAUTH_SCOPE`, `ASSIGNR_SITE_ID`, `ASSIGNR_LEAGUE_ID` | Admin desk. `POST /api/token` mints an access token for the desk | External system of record for umpire names. Local scheduler is the system of record for the public game schedule. They can diverge. |
| GameChanger widgets | Live scores and bracket sync | Widget id stored on the bracket spec, not an env secret | Public poll, admin sync, cron every 10 min for `organizationId=ladistrict2` | Polling continues from the public bracket page. Wrong widget id publishes the wrong games. |
| GameChanger schedule writer | Headless browser service that creates H2H games on web.gc.com | `GAMECHANGER_SCHEDULE_WRITER_ENABLED`, `GAMECHANGER_SCHEDULE_WRITER_ENDPOINT`, `GAMECHANGER_SCHEDULE_WRITER_SECRET`, plus the service’s own `GC_WRITER_*`, `BW_BIN`, `BW_SESSION`, `GRINGOTTS_GC_VAULT_ITEM` | Live path from bracket-final sync. The 15-minute `schedule-manager` cron is dry-run only | Homelab dependency (`services/gamechanger-schedule-writer`). If the writer is down, later-round games are not created. Credentials live outside Vercel. |
| Sports Connect | Registration export → file import. No public API in this repo | `SPORTS_CONNECT_INGEST_SECRET`, `SPORTS_CONNECT_CRON_SECRET`, `SPORTS_CONNECT_ADMIN_BASE_URL`, `ENABLE_SPORTSCONNECT_DRIVE_CRON` | Admin upload, `POST` ingest (n8n bearer), Drive cron every 2 hours | n8n workflow is not in this repo (`docs/sports-connect-import.md` points at potions). Ingest secret is a write credential. |
| Google Drive | Org document embed and Sports Connect file drop | `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64`, `GOOGLE_DRIVE_DELEGATED_USER`, `GOOGLE_DRIVE_DELEGATED_USER_EMAIL`, `AP_GOOGLE_DRIVE_FOLDER_URL` | Documents page and drive-sync cron | Delegated user can see more than one folder if the service account is broad. |
| Google sign-in | Admin login and dugout/registered-user login | `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `ADMIN_GOOGLE_WORKSPACE_DOMAIN` | `POST /api/auth/google`, dugout Google route | Workspace domain restriction applies only where the admin path checks it. |
| PayPal | Cap orders, shirt orders, all-star payments, merch checkout, tournament income | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_WEBHOOK_ID_CAPS`, `PAYPAL_WEBHOOK_ID_SHIRTS`, `PAYPAL_CAP_ITEM_GONZALES`, `PAYPAL_CAP_ITEM_ASCENSION`, `PAYPAL_CAP_PRICE_CENTS`, `PAYPAL_SHIRT_ITEM_GONZALES`, `PAYPAL_SHIRT_ITEM_ASCENSION`, `PAYPAL_SHIRT_PRICE_CENTS` | Webhooks `app/api/webhooks/paypal`, `paypal-caps`, `paypal-shirts`. Shirt cron every 10 min. Merch routes under `app/api/merch/paypal/*` | Three webhooks. Caps and shirts are classified by item-name keywords. A renamed PayPal item silently stops importing. |
| Facebook / Meta | Social publishing | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `META_PRIVACY_POLICY_URL` | Admin social sync and publish | Page token expiry stops the module with no in-app repair other than env. |
| Canva ingest | Pull a Canva export URL into blob storage for admin images | `CANVA_INGEST_SECRET` | `POST /api/integrations/canva/ingest` | Bearer secret is a write key. Last touched 2026-05-02. Easy to forget it exists. |
| Giphy | Dugout GIF picker | `GIPHY_API_KEY` | Dugout composer | Low. Feed feature, not admin. |
| Bracket PDF vision | OCR / vision fallback when a bracket PDF is ingested | `BRACKET_PDF_OCR_ENABLED`, `BRACKET_PDF_VISION_API_KEY`, `BRACKET_PDF_VISION_API_URL`, `BRACKET_PDF_VISION_MODEL`, `BRACKET_PDF_VISION_CF_ACCESS_CLIENT_ID`, `BRACKET_PDF_VISION_CF_ACCESS_CLIENT_SECRET`, `BRACKET_PDF_VISUAL_READER`, `BRACKET_PDF_FIXTURE` | Admin bracket ingest, up to 120s in the request | Blocks the request. Sends PDFs to whatever URL the vision env points at. |
| Vercel Blob / local `uploads/` | News, sponsor, social, park-info images | Blob config used by `lib/uploads/storeAdminImage.ts` | Admin uploads and Canva ingest | Local `uploads/` vs blob depends on environment. |
| Vercel Cron | The six jobs below | `CRON_SECRET` plus each job’s own secret | `vercel.json` | Several jobs treat a missing secret as “allow” outside production. Production must set the secret. |
| n8n | Optional Sports Connect file-landed ingest | `SPORTS_CONNECT_INGEST_SECRET` | External workflow calling the ingest route | Not referenced as a running worker inside this repo. Docs say the workflow lives in potions. |
| Bootstrap admins | First master user | `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `INITIAL_MASTER_ADMIN_EMAIL`, `INITIAL_MASTER_ADMIN_PASSWORD`, `ADMIN_SITE_URL`, `NEXT_PUBLIC_ADMIN_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `SITE_ORG` | Deploy / seed | Password env vars are long-lived if the seed path still reads them. |

### Crons (`vercel.json`)

| Cron | Schedule | What it does | Admin data it uses |
|---|---|---|---|
| `/api/cron/tournament-monitor` | every 5 min | Health-checks bracket sites and live APIs, syncs GameChanger, writes monitor events, can email/SMS | `BracketProject` (`READY`), `TournamentMonitorRun`, `TournamentMonitorEvent`, `TournamentMonitorSubscription` |
| `/api/cron/bracket-gamechanger-sync?organizationId=ladistrict2` | every 10 min | Imports finals into District 2 ready brackets, then runs Schedule Manager live to create the next GameChanger games | `BracketProject.spec.gameChanger`, `ScheduleManagerJob`, `ScheduleManagerAction` |
| `/api/cron/schedule-manager` | every 15 min | Dry run only, and it skips if a job is already `RUNNING` | `ScheduleManagerJob` |
| `/api/cron/shirt-orders-sync` | every 10 min | Pulls PayPal reporting so shirt orders still land if the webhook was missed | `ShirtOrderRecord`, `ShirtOrderItem` |
| `/api/cron/sports-connect-drive-sync` | every 2 hours | Scans each org’s Drive folder and ingests new exports. No-ops if no folder rows, or if `ENABLE_SPORTSCONNECT_DRIVE_CRON=false` | `SportsConnectOrgDriveFolder`, `SportsConnectImportRun`, `Enrollment` |
| `/api/cron/fallball-daily-report` | 12:00 UTC daily | Emails Fall Ball division capacity (needs coaches / near capacity / surplus) | Sports Connect enrollment capacity (`lib/sportsConnect/fallballCapacity.ts`). Recipient is hard-coded in the route |

There is no cap-order cron. Caps rely on `app/api/webhooks/paypal-caps`. All-star player payments rely on `app/api/webhooks/paypal` plus CSV import in the vault.

### Public pages that read admin-managed data

| Public route | Reads | Which orgs |
|---|---|---|
| `/` | Registration window, news rotator, featured posts, posted games, active `OrgAlert` | Content orgs. Tournament-only sites are bracket-first |
| `/schedule` | Posted `ScheduleDraftGame` and practice slots (`lib/schedule/publicScheduleLoad.ts`), plus standings | Gonzales, Ascension, Fall Ball. Capabilities say `schedule: "scheduler"` for all three |
| `/standings` | `GameScore` via `loadSeasonStandings` | Content orgs. Fall Ball has `liveScores: "none"`; standings still follow saved scores |
| `/today` | Bracket “today” schedule (`lib/tournament-brackets/todaySchedule.ts`) | Bracket orgs, including District 2 and 6 |
| `/tournaments` | Published `BracketProject` | Gonzales, Ascension, District 2, District 6. Hidden on Fall Ball |
| `/park-info` | `ParkInfoPage` | Content orgs that publish it. Master-managed |
| `/news`, `/news/[slug]` | `NewsPost` | Per org feed |
| Sponsors scroller (`/api/sponsors/scroller`, homepage) | `Sponsor`, `SponsorPlacement` | Gonzales and Ascension. Off for Fall Ball |
| `/registration` | `OrgRegistrationWindow` plus Sports Connect or internal copy from capabilities | Fall Ball is Sports Connect. Spring leagues are `internal` in capabilities |
| `/shop` | `MerchProduct` for that org, PayPal checkout | Content orgs with SKUs. Not indexed |
| `/all-star`, `/all-star/vote` | Cycles, candidates, invites, page config | Gonzales and Ascension. Off for Fall Ball |
| `/dugout` | Dugout posts for the org’s registered users | Content orgs. Header hides it on some Fall Ball layouts and shows it on others (`components/Header.tsx`) |
| `/coach-corner` | Teams, players, schedule, draft sessions the coach is on | Content orgs |
| `/coaching-interest` | Creates `CoachingInterestSubmission` | All three content orgs |
| `/surveys/[slug]` | Published `Survey` | Whichever org published it |
| `/trip/[token]` | `TripEvent` / participant form | All-star travel events |
| `/tournament-rosters/[token]` | Roster intake link | Tournament operators |
| `/volunteer-card` | Volunteer compliance for the signed-in person | Content orgs |
| `/rosters` | Published team rosters | Content and tournament sites |

---

## 7. Top 10 observations and recommendations

No implementation. These are the cuts and groupings a revamp should decide before drawing screens.

1. **Keep the operating core and treat everything else as seasonal or optional.** The product that is alive in 2026 is: Sports Connect import → teams/draft → scheduler → posted public schedule → scores → umpire pay, plus rainouts, brackets, and email. Parish reports and the park-director field desk are part of that core, not extras. All-star, shop, social, and dugout are real but they are seasons or side products.

2. **Design the park-director day first.** Their loop is already written (`ParkDirectorMenu`: controllers, crew list, cards, scores, pay, and a separate season-setup link). The sidebar is still the master-admin map. A revamp that starts from the sidebar will keep hiding the job that was just built (2026-09-24).

3. **Delete the hub layer from the front door.** People, competition, park, publishing, and orders are redirects. Dashboard cards should open the real page (teams, scores, alerts, communications, reports). Keep the redirects only as bookmarks.

4. **Give each job one module key.** Scheduler, Sports Connect, surveys, cap orders, shirt orders, field desk, and merch all borrow `TEAMS`, `REPORTS`, or `SPONSORS`. That is why park directors see shirt orders and cannot see the survey desk. Set the key to the person who does the job, then let `lib/org/capabilities.ts` hide it per org. Fall Ball’s disabled-module list is the right idea; the sidebar OR-gates fight it.

5. **One home for umpire money.** Assignr pay, the umpire-pay report, and dashboard day-pay answer different questions (Assignr’s statement, the treasurer packet, today’s park). Label them that way or fold the statement into the report. Do not present three “umpire pay” doors.

6. **One seasonal All-Star workspace.** Vault, payments, caps, shirts, travel, and the shop prototype are already a stage nav on the vault. Move that whole strip out of Orders and Publishing. Leave Orders for sponsors and reports the rest of the year.

7. **Cut or finish the merch prototype, and decide SMS.** `/admin/shop/test-order` is still labeled a prototype while `/shop` can take real PayPal orders. Either it is the catalog admin or it should not be in the all-star nav. SMS is code-complete and default-off, with an unused `SmsConsent` model. Leave it off until there is a consent story.

8. **Remove the root `lib/` twins.** Twenty-plus top-level folders (`auth/`, `scheduler/`, `tournament-brackets/`, …) are unused copies, and some have drifted. They will be the first place a revamp edits the wrong file. `lib/` is the live tree. `services/gamechanger-schedule-writer` is the exception: it is a separate service, not a duplicate.

9. **Show GameChanger as one pipeline with an honest mode.** Bracket sync (every 10 minutes, District 2, live), schedule-manager cron (every 15 minutes, dry run), and the homelab writer are one feature split across three doors. The admin should say whether live creation is on, and for which org. Hard-coding `organizationId=ladistrict2` in `vercel.json` will surprise the next district.

10. **Split the four giant screens before adding navigation chrome.** Vault, teams, scheduler, and brackets are the revamp. New information architecture on top of 3,000–5,000 line clients will recreate the hubs that were just split. The Aug 31 split (one URL per job) is the pattern to keep; `docs/admin-module-workflow-pattern.md` already describes it. The Aug 2026 efficiency audit’s N+1 and bundle notes are still useful, and a Sep 28 pass landed some of them (parallel homepage fetches, deferred xlsx/jspdf). Do not restart from that doc; the product shape has moved on (field desk, local scores, parish reports, scheduler wizard).

---

## 8. Open questions

Only Trent or the leagues can answer these. The code does not.

1. For a normal week, who actually signs in, and as which role: master only, one admin per org, board members, park directors? The role matrix is richer than a two-person operation needs.
2. Should park directors run surveys, or was the Sep 18 “park director desk” meant to be admin-operated and only *look* simple?
3. Is Assignr still the umpire system of record for 2026–27, or has the local scheduler plus the pay report replaced it for Fall Ball and maybe for spring?
4. Is the GameChanger schedule writer still running for District 2, and should District 6 or the spring leagues ever create GameChanger games the same way?
5. Is the n8n Sports Connect ingest still landing files, or is the admin upload the only path that matters?
6. Is the public shop a store the leagues want this year, or a prototype to take off the all-star nav?
7. Are cap orders and championship shirts still PayPal items matched by name for Gonzales and Ascension only? Fall Ball has no all-star module, but the order pages are gated by reports, so a Fall Ball park director can still open them.
8. Should SMS stay off? If it should come back, who is allowed to text, and where does consent live?
9. Does anyone still use `/news/admin`, role preview, or the reports host `reports.apbaseball.com`?
10. Which modules must stay visible in the off-season, and which should disappear until season setup starts? Fall Ball already hides all-star, sponsors, and brackets. Spring leagues hide nothing.
11. Dugout: is the feed still wanted for Fall Ball and for spring, or is it a coach tool that should live under Coach Corner?
12. District 2 and District 6: are they bracket sites only, forever, or will they grow directory, umpires, or payments?
