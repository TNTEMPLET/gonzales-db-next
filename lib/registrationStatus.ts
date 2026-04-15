/**
 * Check if registration period is currently open
 * Registration is open from 12/20/2025 to 01/01/2026
 */
export function isRegistrationOpen(): boolean {
  const now = new Date();
  const registrationStart = new Date("2025-12-20");
  const registrationEnd = new Date("2026-01-01");

  return now >= registrationStart && now <= registrationEnd;
}
