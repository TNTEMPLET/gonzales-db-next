# Communications Module Runbook

## Feature flags

- `COMMUNICATIONS_MODULE_ENABLED` (default: `true`)
  - `false` disables `/admin/communications` UI and API responses.
- `COMMUNICATIONS_SMS_ENABLED` (default: `false`)
  - Keeps SMS pipeline disabled in MVP.

## Provider configuration

### Email (live now)

- `RESEND_API_KEY` (required) — Vaultwarden: **`Resend API Key - apbaseball`** (item may be named `…apbasebaall`)
- `COMMUNICATIONS_EMAIL_FROM` (optional emergency default if DB empty)
- `COMMUNICATIONS_UNSUBSCRIBE_SECRET` (required for signed unsubscribe tokens)
- `NEXT_PUBLIC_APP_URL` (recommended for unsubscribe link absolute URL) — on admin: `https://admin.apbaseball.com`

### From address (DB + Master Admin settings)

Source of truth: table **`CommunicationFromAddress`**.

- Campaign dropdown loads **active** rows ordered by `sortOrder`.
- **Master Admin** opens **Manage From addresses** on `/admin/communications` to create / edit / delete / set default without redeploying.
- APIs: `GET/POST /api/admin/communications/from-addresses`, `PATCH/DELETE .../from-addresses/:id` (mutations Master-only).
- Seeded on migrate: noreply (default), communications@, apboard@, support@ on `apbaseball.com`.
- Domain must remain verified in Resend.

Primary production surface: **Vercel project `apbaseball-admin`** (`SITE_ORG=master`).

### SMS (foundation only in MVP)

- `TWILIO_ACCOUNT_SID` (future)
- `TWILIO_AUTH_TOKEN` (future)
- `TWILIO_FROM_NUMBER` (future)

## Operational workflow

1. Create campaign draft in `/admin/communications` **or** multi-select users on `/admin/users` → **Email selected**.
2. Set audience rules (always combined with **`AND`**) and preview recipients.
   - Rule types: `ALL_USERS`, `ORGANIZATION`, `ALL_COACHES`, `ORGANIZATION_COACHES`, `COACHING_INTEREST`, `ADMIN_ROLE`, **`EXPLICIT_USERS`** (Users-page selection; max 500).
3. **Master Admin:** Preview → **Send now** (no second approver; confirm dialog shows count).
4. **Other admins:** Submit for approval → Board Member+ (not campaign creator) approves/rejects → Send now or schedule.
5. Cron or manual trigger can call `POST /api/admin/communications/dispatch-due` for scheduled campaigns.

## Quiet hours behavior

- Quiet hours are represented as `quietHoursStart` and `quietHoursEnd` (0-23).
- When current hour is inside quiet window, dispatch skips send attempt.

## Compliance behavior (MVP)

- Email unsubscribe writes to `EmailSuppression`.
- Suppressed addresses are skipped during send.
- SMS consent is modeled in `SmsConsent` (activation deferred).

## API smoke test checklist

1. `POST /api/admin/communications/campaigns` create draft.
2. `POST /api/admin/communications/campaigns/:id/preview` returns non-zero sample.
3. `POST /api/admin/communications/campaigns/:id/submit-approval`.
4. `POST /api/admin/communications/campaigns/:id/approve` from eligible non-creator.
5. `POST /api/admin/communications/campaigns/:id/send-now` creates `CommunicationDelivery` rows.
6. Open unsubscribe URL and verify `EmailSuppression` upsert.
