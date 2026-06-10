// Date helpers for the subject reveal/lock surfaces. The prototype shows the ack
// deadline as a long date ("June 23, 2026") and the locked/acknowledged stamps as
// a short-month date ("Jun 16, 2026"). Days-left counts whole days from now.

const LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "June 23, 2026" — used for the acknowledgement deadline. */
export function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : LONG.format(d);
}

/** "Jun 16, 2026" — used for locked/acknowledged timestamps. */
export function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : SHORT.format(d);
}

/** Whole days from now until the given instant (never negative for display). */
export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}
