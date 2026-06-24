# Admin Module Workflow Pattern

Use this pattern when refactoring admin modules from single-purpose pages into job-based consoles. Keep modules small, scoped to one operator job, and consistent with the MASTER dashboard and Teams workflow.

## Page Structure

- Route from the MASTER dashboard card to the module console with the active `org` query when the work is site-specific.
- Let the page resolve auth, role preview, target org, and module access before rendering the client manager.
- Use `AdminSectionHeader` for the badge, org switcher, preview control, and return links.
- Organize the module UI by operator job: overview/status first, then workflow sections, then history or audit surfaces.
- Keep server pages thin; put interactive workflow state in the client manager.

## Target Org And All Sites

- A concrete `targetOrg` means actions read and write one site only.
- MASTER `All Sites` is for aggregate visibility or module discovery, not ambiguous writes.
- If a write can affect records, require a concrete org before showing the action.
- Copy should name the active site when it reduces risk: "Gonzales Teams", "site import", or "All Sites overview".

## Workflow Navigation

- Use short, verb-led sections that match the job sequence, as Teams does with Build, Import, Assign, Review, and History.
- Show disabled steps when prerequisites are missing, with nearby copy explaining what unlocks them.
- Keep navigation stateless where possible: `activeSectionId`, section metadata, and an `onNavigate` handler are enough for most modules.
- Deep links are optional; only add them when operators need to share or reload a specific workflow step.

## Status And Health Cards

- Put status cards above risky or time-consuming work.
- Prefer counts and plain labels: total records, missing assignments, warnings, recent import, connection state.
- Use amber for attention-needed states, emerald for healthy/complete states, and red only for failures or destructive warnings.
- External integrations should show connection health, scope/context, and the last actionable error.

## Guided Import And Action Flows

- Imports should follow a visible sequence: upload or paste, map fields, preview changes, confirm, run, review results.
- Preview before writes; include created, updated, skipped, warning, and error counts when available.
- Long imports should report progress and keep batch/import history available for audit or undo.
- Preserve inputs during validation errors so operators can fix mappings without restarting.


## Operational Module Guidance

- Seasonal All-Star modules should name the stage: cycle setup, coach voting, final roster, payment collection, and cap-order fulfillment. Copy should explain which module owns the next step.
- Tournament Brackets are public-facing when READY; import, score, and publish controls should remind admins to preview before families see changes.
- Dugout Moderation should distinguish edit-for-clarity from remove-for-safety, and it should name the community feed impact.
- Scores & Standings should show the score queue first, then the quickest next action: upload a scores file or pick an age group with open games.
- Assignr modules should name the selected site and warn when actions touch the connected Assignr league.
- Park Alerts and Park Info are public-facing; copy should say who sees the change and how to clear or verify it.
- Reporting should explain the date/league filters before generation and only show export actions once results exist.
- Prefer simple status cues from data already loaded on the page, such as active alert count, generated rows, saved scores, or missing content.

## Destructive Confirmation Standards

- Use `window.confirm` only for low-impact single-record actions where the label is unambiguous.
- Use typed confirmation, usually `DELETE`, for permanent deletes, bulk actions, or actions that remove related records.
- Confirmation text must name the object, scope, and consequence: affected team, site, roster/player counts, import batch, or downstream records.
- Never allow destructive actions from `All Sites` unless the action is explicitly designed and labeled as aggregate.

## Verification Checklist

1. MASTER dashboard card routes to the right module and target org.
2. Page blocks unauthorized roles and avoids ambiguous `All Sites` writes.
3. Header, org switcher, preview role, and return links match nearby admin pages.
4. Workflow sections match the operator job order and disabled states explain prerequisites.
5. Status cards expose health, missing setup, recent activity, and integration errors.
6. Imports or bulk actions require preview before write and show result/history feedback.
7. Destructive actions require confirmation proportional to risk and include scope/consequences.
8. Run `git diff --check`; run `pnpm exec tsc --noEmit` when adding or changing TypeScript.
