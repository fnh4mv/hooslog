/**
 * Display-name helpers. Athlete names come from signup (profiles.name) and are
 * sometimes blank — every helper degrades to the email local part rather than
 * rendering an empty cell in the coach grid.
 *
 * Migration 0013 guarantees every athlete row carries at least a first and a
 * last name, backfilled from athlete_emails and enforced by a trigger. These
 * helpers still handle the one-word case, because a display layer that throws
 * away a name it cannot format is worse than one that shows what it has.
 */

type Named = { name: string; email: string };

/** Generational suffixes, so "John Smith Jr" gives "J. Smith" and not "J. Jr".
 *  "V" is deliberately absent — as a trailing token it is far more often a
 *  middle initial than a fifth. */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

function parts(p: Named): string[] {
  return p.name.trim().split(/\s+/).filter(Boolean);
}

/**
 * Capitalise a name typed entirely in lower case. Touched ONLY when the token
 * has no capital of its own, which is what keeps "McMahon", "DeLuca" and
 * "O'Brien" intact — blanket title-casing would flatten them to "Mcmahon".
 * This is why 0013 leaves "alex valencia" in the database as typed: it is a
 * rendering problem, and rewriting a man's name to fix his coach's screen is
 * the wrong place to solve it.
 */
function cap(token: string): string {
  if (!token) return token;
  if (token !== token.toLocaleLowerCase()) return token;
  return token[0].toLocaleUpperCase() + token.slice(1);
}

/** The surname: the last token that isn't a generational suffix. */
function surname(n: string[]): string {
  for (let i = n.length - 1; i >= 0; i--) {
    if (!SUFFIXES.has(n[i].toLocaleLowerCase())) return n[i];
  }
  return n[n.length - 1];
}

/** "J. Alcott" — first initial + LAST name only, the one athlete-name format
 *  used everywhere on the coach portal (coach request, 2026-08-21). Middle
 *  names from signup ("Brenden Michael McMahon") are dropped, not initialed. */
export function shortName(p: Named): string {
  const n = parts(p);
  if (n.length === 0) return p.email.split("@")[0];
  if (n.length === 1) return cap(n[0]);
  return `${n[0][0].toLocaleUpperCase()}. ${cap(surname(n))}`;
}

/** "Jack Alcott" — drill-in and alert strip. */
export function fullName(p: Named): string {
  return parts(p).map(cap).join(" ") || p.email.split("@")[0];
}

/** Roster order: last name, then first. Case- and accent-insensitive. Uses the
 *  same surname rule as shortName so the grid sorts by the name it displays. */
export function rosterKey(p: Named): string {
  const n = parts(p);
  const last = n.length > 1 ? surname(n) : n[0] ?? p.email;
  const first = n.length > 1 ? n[0] : "";
  return `${last} ${first}`.toLocaleLowerCase();
}
