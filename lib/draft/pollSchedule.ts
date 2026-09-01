/**
 * Every open admin/coach tab on a live draft polls its own session-state
 * endpoint. A plain fixed-period `setInterval` means every tab that mounted
 * around the same moment (e.g. everyone joining right as the draft goes
 * live) keeps polling in near lock-step forever, turning what should be
 * steady background load into a recurring burst every cycle. Jittering each
 * poll's delay spreads that same request volume out over time instead.
 */
export function jitteredPollDelayMs(baseMs: number, jitterMs: number): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}
