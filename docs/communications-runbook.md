# Communications Module Runbook

## Feature flags

- `COMMUNICATIONS_MODULE_ENABLED` (default: `true`)
  - `false` disables `/admin/communications` UI and API responses.
- `COMMUNICATIONS_SMS_ENABLED` (default: `false`)
  - Keeps SMS pipeline disabled in MVP.

## Provider configuration

### Email (live now)

- `RESEND_API_KEY` (required)
- `COMMUNICATIONS_EMAIL_FROM` (required; fallback: `RESEND_FROM_EMAIL`)
- `COMMUNICATIONS_UNSUBSCRIBE_SECRET` (required for signed unsubscribe tokens)
- `NEXT_PUBLIC_APP_URL` (recommended for unsubscribe link absolute URL)

### SMS (foundation only in MVP)

- `TWILIO_ACCOUNT_SID` (future)
- `TWILIO_AUTH_TOKEN` (future)
- `TWILIO_FROM_NUMBER` (future)

## Operational workflow

1. Create campaign draft in `/admin/communications`.
2. Set audience rules (always combined with **`AND`**) and preview recipients.
3. Submit campaign for approval.
4. Board Member+ (not campaign creator) approves/rejects.
5. Send immediately or schedule for dispatch.
6. Cron or manual trigger can call `POST /api/admin/communications/dispatch-due`.

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
