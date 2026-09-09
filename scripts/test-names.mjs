/**
 * Display-name unit tests. The coach portal is name-critical: "some of these
 * are just first names" is what prompted migration 0013, and the formatter is
 * the half of that fix which is testable without a database.
 *
 *   IMPORTER_PATH-style run, no bundler needed:
 *   cp src/lib/names.ts /tmp/t/ && node scripts/test-names.mjs
 *   (NAMES_PATH defaults to a sibling copy; pass an absolute path to override)
 */
const MOD = process.env.NAMES_PATH ?? "./names.ts";
const { shortName, fullName, rosterKey } = await import(MOD);

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  if (got === want) pass++;
  else { fail++; console.log(`   ✗ ${label}: got "${got}", want "${want}"`); }
};
const P = (name, email = "x@virginia.edu") => ({ name, email });

// ---- the format the coach asked for ----
eq(shortName(P("Brenden Michael McMahon")), "B. McMahon", "middle name dropped, not initialed");
eq(shortName(P("Henry Acorn")), "H. Acorn", "plain two-word name");
eq(shortName(P("Trent W Daniels")), "T. Daniels", "middle initial dropped");
eq(shortName(P("Ciarán Brosnan")), "C. Brosnan", "accented first name");

// ---- the five names 0013 backfills, as they render AFTER the backfill ----
eq(shortName(P("Cayden Wayne Dyer")), "C. Dyer", "Dyer after backfill");
eq(shortName(P("Jonathan Logan Seyfert")), "J. Seyfert", "Seyfert after backfill");
eq(shortName(P("Ben Isaac Godish")), "B. Godish", "Godish after backfill");

// ---- lower-case entry is fixed at render time, not in the database ----
eq(shortName(P("alex valencia")), "A. Valencia", "all-lowercase name is capitalised");
eq(fullName(P("alex valencia")), "Alex Valencia", "fullName capitalises too");

// ---- capitalisation must NOT flatten names that carry their own capitals ----
eq(shortName(P("Brenden McMahon")), "B. McMahon", "McMahon keeps its inner capital");
eq(shortName(P("Tony DeLuca")), "T. DeLuca", "DeLuca keeps its inner capital");
eq(shortName(P("Sean O'Brien")), "S. O'Brien", "O'Brien is left alone");

// ---- generational suffixes ----
eq(shortName(P("John Smith Jr")), "J. Smith", "Jr is not the surname");
eq(shortName(P("John Smith III")), "J. Smith", "III is not the surname");
eq(shortName(P("Alexander J Valencia")), "A. Valencia", "trailing real surname wins");

// ---- degraded input still renders something a coach can click ----
eq(shortName(P("Ben")), "Ben", "one word shows as itself");
eq(shortName(P("ben")), "Ben", "one lowercase word is capitalised");
eq(shortName(P("", "kma8am@virginia.edu")), "kma8am", "blank name falls back to the email");
eq(shortName(P("   ", "kma8am@virginia.edu")), "kma8am", "whitespace-only name falls back too");

// ---- sorting matches what is displayed ----
eq(rosterKey(P("John Smith Jr")), "smith john", "sorts by real surname, not the suffix");
eq(rosterKey(P("alex valencia")), "valencia alex", "sort key is case-insensitive");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
