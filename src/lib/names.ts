/**
 * Display-name helpers. Athlete names come from signup (profiles.name) and are
 * sometimes blank — every helper degrades to the email local part rather than
 * rendering an empty cell in the coach grid.
 */

type Named = { name: string; email: string };

function parts(p: Named): string[] {
  return p.name.trim().split(/\s+/).filter(Boolean);
}

/** "J. Alcott" — first initial + LAST name only, the one athlete-name format
 *  used everywhere on the coach portal (coach request, 2026-08-21). Middle
 *  names from signup ("Brenden Michael McMahon") are dropped, not initialed. */
export function shortName(p: Named): string {
  const n = parts(p);
  if (n.length === 0) return p.email.split("@")[0];
  if (n.length === 1) return n[0];
  return `${n[0][0]}. ${n[n.length - 1]}`;
}

/** "Jack Alcott" — drill-in and alert strip. */
export function fullName(p: Named): string {
  return parts(p).join(" ") || p.email.split("@")[0];
}

/** Roster order: last name, then first. Case- and accent-insensitive. */
export function rosterKey(p: Named): string {
  const n = parts(p);
  const last = n.length > 1 ? n[n.length - 1] : n[0] ?? p.email;
  const first = n.length > 1 ? n[0] : "";
  return `${last} ${first}`.toLocaleLowerCase();
}
