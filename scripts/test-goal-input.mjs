/**
 * lib/goal-input is the single rule both doors use — the in-app week builder's
 * text boxes and the spreadsheet importer's cells. These cases are the ones
 * that actually went wrong in production, plus the round trip that lets a
 * coach open a posted week and re-post it unchanged.
 *
 * Run (no network):
 *   cp src/lib/goal-input.ts scripts/goal-input.ts
 *   node scripts/test-goal-input.mjs
 *   rm scripts/goal-input.ts
 */
const { parseMileageInput, formatMileageInput } =
  await import(process.env.GOAL_INPUT_PATH ?? "./goal-input.ts");

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${got === undefined ? "" : ` — got ${JSON.stringify(got)}`}`); }
};

const val = (s, kind = "weekly goal") => parseMileageInput(s, kind);

// ---- plain numbers --------------------------------------------------------
ok("plain int", (() => { const r = val("57"); return r.ok && !r.empty && r.value === 57 && r.label === null; })());
ok("decimal", (() => { const r = val("57.5"); return r.ok && !r.empty && r.value === 57.5; })());
ok("whitespace trimmed", (() => { const r = val("  60  "); return r.ok && !r.empty && r.value === 60; })());

// ---- empty is not an error ------------------------------------------------
ok("empty", (() => { const r = val(""); return r.ok && r.empty; })());
ok("spaces only", (() => { const r = val("   "); return r.ok && r.empty; })());

// ---- ranges: tracked as the midpoint, shown as written --------------------
ok("range hyphen", (() => { const r = val("55-60"); return r.ok && !r.empty && r.value === 57.5 && r.label === "55-60"; })());
ok("range en dash", (() => { const r = val("55 – 60"); return r.ok && !r.empty && r.value === 57.5; })());
ok("range 'to'", (() => { const r = val("55 to 60"); return r.ok && !r.empty && r.value === 57.5; })());
ok("range backwards rejected", (() => { const r = val("60-55"); return !r.ok && /backwards/.test(r.message); })());

// THE one. In Excel this became a date; here it is a range, and the builder
// echoes "avg 12.5" back at the coach before anything posts.
ok("12-13 is a range, not December",
  (() => { const r = val("12-13", "long run"); return r.ok && !r.empty && r.value === 12.5 && r.label === "12-13"; })());

// ---- minimums: tracked as the floor --------------------------------------
ok("60+", (() => { const r = val("60+"); return r.ok && !r.empty && r.value === 60 && r.label === "60+"; })());
ok("60 +  spaced", (() => { const r = val("60 +"); return r.ok && !r.empty && r.value === 60; })());

// ---- caps, per field ------------------------------------------------------
ok("weekly over cap", !val("250").ok);
ok("weekly at cap ok", val("200").ok);
ok("long run over cap", !val("65", "long run").ok);
ok("long run at cap ok", val("40", "long run").ok);
ok("weekly accepts 65", val("65").ok);
ok("zero rejected", !val("0").ok);
ok("negative rejected", !val("-5").ok);

// ---- nonsense -------------------------------------------------------------
ok("word rejected", (() => { const r = val("easy week"); return !r.ok && /isn't a number/.test(r.message); })());
ok("message names the field", (() => { const r = val("nope", "long run"); return !r.ok && /Long runs/.test(r.message); })());

// ---- round trip: open a posted week, post it back unchanged ---------------
for (const [value, label, expected] of [
  [57, null, "57"],
  [57.5, null, "57.5"],
  [57.5, "55-60", "55-60"],
  [60, "60+", "60+"],
  [null, null, ""],
  [undefined, undefined, ""],
]) {
  const box = formatMileageInput(value, label);
  ok(`format ${JSON.stringify(label ?? value)}`, box === expected, box);
  if (box) {
    const r = parseMileageInput(box, "weekly goal");
    ok(`round trip ${box}`, r.ok && !r.empty && r.value === value && r.label === label, r);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
