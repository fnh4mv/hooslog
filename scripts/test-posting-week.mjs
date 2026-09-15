/**
 * Which Monday does the builder open on?
 *
 * The rule (William, 2026-09-15): from NOON ON SUNDAY it is the week ahead,
 * and it stays that week until the next Sunday noon. Before Sunday noon it is
 * the week in progress, which is still the one a correction would apply to.
 *
 * Every boundary is here because every one of them is a week a coach could
 * post to the wrong seven days.
 *
 * Run (no network):
 *   cp src/lib/dates.ts scripts/dates.ts && node scripts/test-posting-week.mjs && rm scripts/dates.ts
 */
const { postingWeekMondayFrom, isoDate } = await import(process.env.DATES_PATH ?? "./dates.ts");

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
}

// September 2026: Mon 14, Tue 15 … Sun 20, Mon 21 … Sun 27, Mon 28.
const d = (day, h) => postingWeekMondayFrom(new Date(2026, 8, day), h);

// ---- the week in progress, Monday through Saturday ----------------------
eq("Mon 14 morning",      isoDate(d(14, 8)),  "2026-09-14");
eq("Mon 14 pre-dawn",     isoDate(d(14, 1)),  "2026-09-14"); // NOT last week: the
                                                             // 3am rollover is for
                                                             // logging, not posting
eq("Wed 16 midday",       isoDate(d(16, 13)), "2026-09-14");
eq("Sat 19 late",         isoDate(d(19, 23)), "2026-09-14");

// ---- Sunday, either side of noon ---------------------------------------
eq("Sun 20 08:00",        isoDate(d(20, 8)),  "2026-09-14"); // still the week ending
eq("Sun 20 11:00",        isoDate(d(20, 11)), "2026-09-14");
eq("Sun 20 12:00 flip",   isoDate(d(20, 12)), "2026-09-21"); // noon exactly flips
eq("Sun 20 13:00",        isoDate(d(20, 13)), "2026-09-21");
eq("Sun 20 23:00",        isoDate(d(20, 23)), "2026-09-21");

// ---- and it STAYS there: "any time after that" -------------------------
eq("Mon 21 00:30",        isoDate(d(21, 0)),  "2026-09-21"); // the midnight seam
eq("Mon 21 07:39",        isoDate(d(21, 7)),  "2026-09-21"); // Dunbar's actual hour
eq("Thu 24 16:00",        isoDate(d(24, 16)), "2026-09-21");
eq("Sat 26 09:00",        isoDate(d(26, 9)),  "2026-09-21");
eq("Sun 27 11:59",        isoDate(d(27, 11)), "2026-09-21"); // last moment before
eq("Sun 27 12:00",        isoDate(d(27, 12)), "2026-09-28"); // the next flip

// ---- month and year boundaries -----------------------------------------
const dd = (y, m, day, h) => postingWeekMondayFrom(new Date(y, m, day), h);
eq("Sun Nov 29 2026 pm",  isoDate(dd(2026, 10, 29, 14)), "2026-11-30"); // into December
eq("Sun Dec 27 2026 pm",  isoDate(dd(2026, 11, 27, 14)), "2026-12-28");
eq("Thu Dec 31 2026",     isoDate(dd(2026, 11, 31, 10)), "2026-12-28"); // week spans NY
eq("Fri Jan 1 2027",      isoDate(dd(2027, 0, 1, 10)),   "2026-12-28");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
