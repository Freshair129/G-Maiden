/**
 * Kill-streak banner labels — the on-screen text for each consecutive-kill rung.
 *
 * SYNC CONTRACT (CLAUDE.md "Kill-banner sync"): these MUST mirror the streak
 * ladder in `src-tauri/src/announcer.rs` exactly, so the voiced streak line and
 * the on-screen banner always agree. If you add/rename a tier, change it here,
 * in announcer.rs, and in G-Suite/schemas/gmaiden-events.json.
 *
 * Extracted from App.tsx so both the (dormant) lite overlay and the Full overlay
 * render the same labels.
 */
export const STREAK_LABELS: Record<number, string> = {
  3: 'KILLING SPREE', 4: 'DOMINATING', 5: 'MEGA KILL',
  6: 'UNSTOPPABLE', 7: 'WICKED SICK', 8: 'MONSTER KILL',
  9: 'GODLIKE', 10: 'BEYOND GODLIKE',
}
