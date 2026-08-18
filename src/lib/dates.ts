/**
 * Date helpers for training days.
 *
 * Training days are DATE strings ("YYYY-MM-DD"), never timestamps. Every
 * helper works from local Y/M/D parts — never `new Date("YYYY-MM-DD")`,
 * which parses as UTC midnight and shifts the day in US timezones.
 * Weeks start Monday (matches athlete_weeks.week_start).
 */

/** New Date n days after d (n may be negative). Never mutates d. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday of the week containing d. */
export function mondayOf(d: Date): Date {
  const dow = d.getDay(); // 0 Sun … 6 Sat
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

/** "YYYY-MM-DD" from local Y/M/D parts. */
export function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parse "YYYY-MM-DD" into a local Date; null if malformed or not a real day. */
export function fromISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(y, mo - 1, day);
  // Round-trip check catches things like 2026-02-31.
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day
    ? d
    : null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 8/10" */
export function fmtDayShort(d: Date): string {
  return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** "Aug 10" */
export function fmtMonthDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Today as a calendar day in Eastern time — the team's timezone. Vercel
 * servers run UTC, where a naive `new Date()` is already "tomorrow" from
 * ~8pm ET; this keeps "today" honest for the people actually logging.
 */
export function todayET(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/**
 * The training day rolls over at 3 AM ET, not midnight. A run logged at
 * 12:40 AM is still last night's run — and on a Sunday night it belongs to
 * the closing week, not the new one. Distance runners log late; nobody has
 * finished the *next* day's run by 3 AM.
 */
export const TRAINING_DAY_ROLLOVER_HOUR = 3;

/** Today for training purposes: todayET(), still "yesterday" before 3 AM ET.
 *  Drives which day/week the portals open on — validation stays on todayET()
 *  so a genuine after-midnight run can still be logged to the new day. */
export function trainingTodayET(): Date {
  const d = todayET();
  return hourET() < TRAINING_DAY_ROLLOVER_HOUR ? addDays(d, -1) : d;
}

/** Current hour (0–23) in Eastern time. Used to hold the "log today" nudge
 *  until the end of the day rather than nagging first thing in the morning. */
export function hourET(): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date()).find((p) => p.type === "hour")?.value;
  return Number(h) % 24;
}
