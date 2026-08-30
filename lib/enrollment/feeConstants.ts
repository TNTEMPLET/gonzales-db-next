/**
 * Named, overridable constants for the treasurer's fee-deduction math
 * (credit-card processing fee + per-player online registration fee), used to
 * compute netDueCents in lib/enrollment/kpi.ts. These rates are not present
 * anywhere in the raw SportsConnect export — they were confirmed from the
 * org's own manually-built season report (3.4% CC fee, $3/player online
 * fee). If these ever legitimately vary by org, season, or payment
 * processor, move them to a per-org record (e.g. lib/org/capabilities.ts)
 * before trusting the numbers for a real board meeting.
 */
export const CREDIT_CARD_PROCESSING_FEE_RATE = 0.034;

export const ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER = 300;
