import readXlsxFile from "read-excel-file/node";
import { isoDate, mondayOf, trainingTodayET } from "@/lib/dates";

/**
 * Parser for the coach's week-plan template
 * (docs/templates/hooslog_week_plan_template.xlsx). That file IS the format
 * contract — locked 23, template-first rather than parsing whatever Excel the
 * coach happens to have.
 *
 * Contract:
 *   "Week Plan" tab — B3 = the Monday date, C6:C12 = DISTANCE plan text for
 *                     Mon…Sun, D6:D12 = MID-DISTANCE plan text for Mon…Sun
 *   "Goals"     tab — row 1 headers, rows 2+ = one athlete each. Columns are
 *                     located by HEADER TEXT, not position: ATHLETE NAME, UVA
 *                     EMAIL, WEEKLY GOAL, LONG RUN, GROUP ("Distance" /
 *                     "Mid-D"; blank = no change).
 *
 * Backward compatible with every older template on purpose. The v1 file has no
 * mid-distance plan column (seven empty mid plans) and no GROUP column (a null
 * group on every athlete, so nobody moves). The v2 file has GROUP in column D
 * and no LONG RUN column — reading columns by position would take "Mid-D" for
 * a long run distance, which is exactly why the header lookup exists. Coaches
 * holding an old file keep working; they just get no long run.
 *
 * Every failure is a plain-English sentence naming the cell. A coach at 9pm on
 * a Sunday should never see a stack trace or the word "undefined".
 */

export type ImportError = { where: string; message: string };
export type ImportWarning = { where: string; message: string };

/** Which schedule an athlete runs. null = the file didn't say; leave them
 *  wherever they already are (locked 25 — a blank cell never resets anyone). */
export type ParsedGroup = "distance" | "mid" | null;

export type ParsedGoal = {
  row: number; // 1-based row in the Goals tab, for error messages
  name: string;
  email: string;
  /** The group this file puts them in, or null for "don't touch it". */
  group: ParsedGroup;
  /** The tracked number: the value itself, a range's midpoint, a minimum's
   *  floor. null = the row carried a group change but no mileage. */
  goal: number | null;
  /** The goal as the coach wrote it ("55-60", "60+"); null for a plain number.
   *  Athletes see this; the bar math uses `goal`. */
  label: string | null;
  /** How long that week's long run should be, same tracked-number rule as
   *  `goal`. null = no long run set for this athlete this week — either the
   *  cell was blank or the file predates the column. */
  longRun: number | null;
  /** The long run as the coach wrote it ("14-16", "16+"); null for a plain
   *  number. Display-only, like `label` (locked 28). */
  longRunLabel: string | null;
};

export type ParsedTemplate = {
  weekStartISO: string; // always a Monday
  /** Exactly 7; index 0 = Monday; "" = no plan that day. */
  plansDistance: string[];
  /** Exactly 7, same shape. All "" when the file predates the mid-D column. */
  plansMid: string[];
  goals: ParsedGoal[];
  warnings: ImportWarning[];
};

export type ParseResult =
  | { ok: true; data: ParsedTemplate }
  | { ok: false; errors: ImportError[] };

const PLAN_TAB = "week plan";
const GOALS_TAB = "goals";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EXAMPLE_EMAIL = "abc1de@virginia.edu";
const MAX_GOAL = 200; // a 200-mile week would be a world record; anything above is a typo
// Matches the per-log cap in migration 0003 and the column check in 0012. It is
// deliberately loose: the realistic mistake is the WEEKLY number typed into the
// long run cell (65), and 40 catches that while never blocking a real long run.
const MAX_LONG_RUN = 40;
/**
 * The Goals tab is five columns wide and the importer reads nothing past it.
 * The template keeps its instruction text and squad counters in F onward for
 * exactly that reason.
 *
 * The header scan MUST respect the same boundary. The hint line in G1 reads
 * "Yellow cells are yours: weekly mileage, group, and long run" — it contains
 * every word this lookup searches for. If the real GROUP header is ever
 * renamed, an unbounded scan claims column G as the group column, and then
 * every line of instructions comes back as "isn't a training group" while the
 * counter rows come back as "row 33 has no email". Caught by fixture 18.
 */
const MAX_GOALS_COL = 5;
const MAX_PLAN_CHARS = 500;

/** What a coach might type in the GROUP column, normalised. The dropdown in
 *  the template offers "Distance"/"Mid-D"; these are the spellings a coach
 *  typing freehand actually reaches for. */
const GROUP_WORDS: Record<string, Exclude<ParsedGroup, null>> = {
  d: "distance", dist: "distance", distance: "distance", "long distance": "distance",
  md: "mid", mid: "mid", "mid-d": "mid", "midd": "mid", "mid d": "mid",
  "mid distance": "mid", "mid-distance": "mid", "middistance": "mid",
  "middle distance": "mid", "middle": "mid", "mid dist": "mid", "mid-dist": "mid",
};

type Cell = string | number | boolean | Date | null;
type Sheet = { sheet: string; data: Cell[][] };

/** Cell at 1-based row/column, or null when the row or column doesn't exist. */
function cell(data: Cell[][], row: number, col: number): Cell {
  return data[row - 1]?.[col - 1] ?? null;
}

function text(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(v);
  return String(v).trim();
}

/**
 * A DATE cell from the parser is UTC midnight. Reading it with local getters
 * would shift it a day west of Greenwich — the exact bug src/lib/dates.ts
 * exists to prevent — so pull the calendar parts back out in UTC.
 */
function toLocalDate(v: Date): Date {
  return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
}

/**
 * A real calendar day from Y/M/D parts, or null. The round-trip check rejects
 * days that JS would silently roll over — a typed 2026-02-31 must be an error
 * naming the cell, not a plan quietly posted for March 3 (same rule as
 * `fromISO` in src/lib/dates.ts).
 */
function realDate(y: number, mo: number, day: number): Date | null {
  const d = new Date(y, mo - 1, day);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day
    ? d
    : null;
}

/** Accepts a real date cell, or text the coach typed as YYYY-MM-DD or M/D/YYYY. */
function readDate(v: Cell): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toLocalDate(v);

  const s = text(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return realDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return realDate(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

/** A spreadsheet column letter from a 1-based index. The Goals tab is five
 *  columns wide, so single letters are all this ever needs. */
function colLetter(n: number): string {
  return String.fromCharCode(64 + n);
}

/**
 * Where each field lives on the Goals tab, 1-based; null = this file doesn't
 * have that column at all.
 *
 * Matched by HEADER TEXT rather than fixed position. LONG RUN was inserted at
 * column D on 2026-09-07 and pushed GROUP to E; a coach still holding the
 * previous file would otherwise have "Mid-D" read as a long run distance and
 * every row rejected. Anything the header row doesn't name falls back to the
 * original layout, so a file whose header row was deleted parses as it always
 * did.
 */
type GoalColumns = {
  name: number;
  email: number;
  goal: number;
  longRun: number | null;
  group: number | null;
};

function locateGoalColumns(goalSheet: Cell[][]): GoalColumns {
  // Bounded on purpose — see MAX_GOALS_COL.
  const header = (goalSheet[0] ?? []).slice(0, MAX_GOALS_COL);
  const found: Record<keyof GoalColumns, number | null> = {
    name: null, email: null, goal: null, longRun: null, group: null,
  };
  header.forEach((h, i) => {
    const s = text(h).toLowerCase();
    if (!s) return;
    const col = i + 1;
    // Order matters: "LONG RUN (MILES)" and "WEEKLY GOAL (MILES)" both say
    // "miles", so long run has to claim its column first.
    if (found.name === null && /name/.test(s)) found.name = col;
    else if (found.email === null && /e-?mail/.test(s)) found.email = col;
    else if (found.longRun === null && /long\s*-?\s*run/.test(s)) found.longRun = col;
    else if (found.goal === null && /weekly|mileage|miles|goal/.test(s)) found.goal = col;
    // "GROUP" is what the template ships, but a coach relabelling this column
    // by hand writes what it actually holds: "Mid-D or Distance". Matching only
    // /group/ would leave that column unfound and quietly move nobody between
    // squads, which is the worst failure this file has. Safe to include
    // "distance" here only because longRun and goal both claim their columns
    // first, so "LONG RUN DISTANCE" and "WEEKLY DISTANCE" never reach it.
    else if (found.group === null && /group|squad|mid.?-?d|distance/.test(s)) {
      found.group = col;
    }
  });
  return {
    name: found.name ?? 1,
    email: found.email ?? 2,
    goal: found.goal ?? 3,
    longRun: found.longRun,
    group: found.group,
  };
}

type MileageCell =
  | { ok: true; value: number; label: string | null }
  | { ok: false; message: string };

/**
 * Reads one of the two mileage cells. A coach writes these three ways and all
 * three have to survive: a plain number (58), a range (55-60, 55 to 60), or a
 * minimum (60+). Returns the tracked number — the value, a range's midpoint, a
 * minimum's floor — plus the text as written, which is what athletes see
 * (0010). null means the cell was blank, which is never an error here.
 */
function readMileage(
  raw: Cell,
  who: string,
  what: "weekly goal" | "long run",
  max: number,
): MileageCell | null {
  const s = text(raw);
  if (!s) return null;

  // Excel silently converts low ranges like "5-10" into dates the moment
  // they're typed. Catch that before it reads as a nonsense number.
  if (raw instanceof Date) {
    return {
      ok: false,
      message: `${who}'s ${what} looks like Excel turned a range into a date. Type it with the word "to" (like 5 to 10), or format the cell as Text first.`,
    };
  }

  let value: number;
  let label: string | null = null;
  // Minimums — "60+" means at least sixty. Shown as written; the bar quietly
  // tracks the floor. (A typed "+60" never reaches here: Excel itself reads
  // that as the number 60.)
  const plus = /^(\d+(?:\.\d+)?)\s*\+$/.exec(s);
  // And ranges — "45-49", "45 – 49", "45 to 49". Shown as written; the bar
  // tracks the middle.
  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i.exec(s);
  if (plus) {
    value = Number(plus[1]);
    label = s;
  } else if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo > hi) {
      return {
        ok: false,
        message: `"${s}" is backwards — put the smaller number first, like ${hi}-${lo}.`,
      };
    }
    value = (lo + hi) / 2;
    label = s;
  } else {
    value = typeof raw === "number" ? raw : Number(s);
  }

  if (!Number.isFinite(value)) {
    const examples =
      what === "weekly goal"
        ? "like 70, a range like 45-49, or a minimum like 60+"
        : "like 14, a range like 14-16, or a minimum like 16+";
    return {
      ok: false,
      message: `"${s}" isn't a number. ${what === "weekly goal" ? "Weekly goals" : "Long runs"} are miles — ${examples}.`,
    };
  }
  if (value <= 0 || value > max) {
    return {
      ok: false,
      message: `A ${what} of ${value} miles isn't right — it should be between 1 and ${max}.`,
    };
  }
  return { ok: true, value: Math.round(value * 10) / 10, label };
}

/** Parse the uploaded workbook. Never throws — a bad file comes back as errors. */
export async function parseTemplate(file: Buffer): Promise<ParseResult> {
  let sheets: Sheet[];
  try {
    sheets = (await readXlsxFile(file)) as unknown as Sheet[];
  } catch {
    return {
      ok: false,
      errors: [
        {
          where: "File",
          message:
            "That doesn't look like an .xlsx spreadsheet. Download the template below, fill it in, and save it as .xlsx (not .xls, .csv, or Numbers).",
        },
      ],
    };
  }

  const find = (want: string) =>
    sheets.find((s) => s.sheet.trim().toLowerCase() === want)?.data ?? null;
  const planSheet = find(PLAN_TAB);
  const goalSheet = find(GOALS_TAB);

  // A missing tab means the wrong file entirely — say which tabs we did find
  // rather than making the coach guess.
  const errors: ImportError[] = [];
  const found = sheets.map((s) => `"${s.sheet}"`).join(", ") || "none";
  if (!planSheet) {
    errors.push({
      where: "Tabs",
      message: `No tab named "Week Plan". This file has: ${found}. Use the template without renaming its tabs.`,
    });
  }
  if (!goalSheet) {
    errors.push({
      where: "Tabs",
      message: `No tab named "Goals". This file has: ${found}. Use the template without renaming its tabs.`,
    });
  }
  if (!planSheet || !goalSheet) return { ok: false, errors };

  const warnings: ImportWarning[] = [];

  // ---- B3: the Monday ----
  const rawWeek = cell(planSheet, 3, 2);
  const weekDate = readDate(rawWeek);
  if (!weekDate) {
    errors.push({
      where: "Week Plan!B3",
      message:
        text(rawWeek) === ""
          ? "The week's Monday date is empty. Put the Monday of the week you're planning in cell B3."
          : `"${text(rawWeek)}" isn't a date. Cell B3 should hold a real date, like 8/10/2026.`,
    });
  } else if (weekDate.getDay() !== 1) {
    const monday = mondayOf(weekDate);
    errors.push({
      where: "Week Plan!B3",
      message: `${isoDate(weekDate)} is a ${DAYS[(weekDate.getDay() + 6) % 7]}, and weeks start on Monday. Did you mean ${isoDate(monday)}?`,
    });
  } else if (isoDate(weekDate) < isoDate(mondayOf(trainingTodayET()))) {
    // The template ships with a fixed example date, so posting a week that has
    // already passed is the single likeliest coach mistake. A warning, not an
    // error — backfilling an old week on purpose stays possible. Training-day
    // clock, same as every page: at 1 AM Monday the closing week isn't "past".
    warnings.push({
      where: "Week Plan!B3",
      message: `${isoDate(weekDate)} is a past week — this week started ${isoDate(mondayOf(trainingTodayET()))}. If you're planning the week ahead, fix the Monday date in B3 before posting.`,
    });
  }

  // ---- C6:C12 and D6:D12: the seven days, twice ----
  // Two schedules, not one (locked 24): column C is what the distance guys
  // run, column D is what the mid-distance guys run.
  const readPlanColumn = (col: number, letter: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const value = text(cell(planSheet, 6 + i, col));
      if (value.length > MAX_PLAN_CHARS) {
        errors.push({
          where: `Week Plan!${letter}${6 + i}`,
          message: `${DAYS[i]}'s plan is ${value.length} characters — keep it under ${MAX_PLAN_CHARS} so it fits on a phone.`,
        });
      }
      if (/\(example\b/i.test(value)) {
        warnings.push({
          where: `Week Plan!${letter}${6 + i}`,
          message: `${DAYS[i]} still has the template's example text in it.`,
        });
      }
      out.push(value);
    }
    return out;
  };
  const plansDistance = readPlanColumn(3, "C");
  const plansMid = readPlanColumn(4, "D");

  const noDistance = plansDistance.every((p) => p === "");
  const noMid = plansMid.every((p) => p === "");
  if (noDistance && noMid) {
    warnings.push({
      where: "Week Plan!C6:D12",
      message: "No workouts filled in — this will post an empty week.",
    });
  } else if (noDistance) {
    warnings.push({
      where: "Week Plan!C6:C12",
      message: "The distance column is empty — the distance guys get no workouts this week.",
    });
  }

  // ---- Goals tab: one athlete per row from row 2 ----
  const cols = locateGoalColumns(goalSheet);
  if (cols.group === null) {
    // Silence here is dangerous: with no GROUP column every athlete keeps the
    // squad he already has, the mid-D guys quietly stay on the distance
    // schedule, and the upload otherwise looks like a clean success.
    warnings.push({
      where: "Goals!row 1",
      message:
        "No GROUP column found on the Goals tab, so nobody's training group will change with this upload. If you meant to move anyone between Distance and Mid-D, check that the header on that column says GROUP.",
    });
  }
  if (cols.longRun === null) {
    warnings.push({
      where: "Goals!row 1",
      message:
        "This file has no LONG RUN column, so nobody gets a long run target this week. It's an older copy of the week file — download the current one below and the column is there, right next to the weekly mileage.",
    });
  }

  const goals: ParsedGoal[] = [];
  const seen = new Map<string, number>();
  /** Athletes whose weekly mileage cell was blank — summarised into one warning. */
  const noMileage: string[] = [];
  /** Long run longer than the whole week's mileage — impossible, so it is a
   *  typo, and it gets one collapsed warning rather than one per athlete. */
  const longerThanWeek: string[] = [];
  for (let r = 2; r <= goalSheet.length; r++) {
    const name = text(cell(goalSheet, r, cols.name));
    const email = text(cell(goalSheet, r, cols.email)).toLowerCase();
    const rawGoal = cell(goalSheet, r, cols.goal);
    const goalText = text(rawGoal);
    const rawLong = cols.longRun === null ? null : cell(goalSheet, r, cols.longRun);
    const groupText = cols.group === null ? "" : text(cell(goalSheet, r, cols.group));

    // blank row, skip quietly
    if (!name && !email && !goalText && !text(rawLong) && !groupText) continue;

    if (email === EXAMPLE_EMAIL) {
      errors.push({
        where: `Goals!row ${r}`,
        message: "That's still the template's example row. Delete it and put your athletes in.",
      });
      continue;
    }

    if (!email) {
      errors.push({
        where: `Goals!${colLetter(cols.email)}${r}`,
        message: `Row ${r} has no email${name ? ` (${name})` : ""}. The email is how the upload finds the athlete.`,
      });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({
        where: `Goals!${colLetter(cols.email)}${r}`,
        message: `"${email}" isn't a valid email address.`,
      });
      continue;
    }
    const dupe = seen.get(email);
    if (dupe) {
      errors.push({
        where: `Goals!${colLetter(cols.email)}${r}`,
        message: `${email} appears twice (rows ${dupe} and ${r}). Keep one row per athlete.`,
      });
      continue;
    }

    // ---- the GROUP column: which schedule this athlete runs ----
    // Blank is the common case and means "leave him where he is" (locked 25).
    // A typo is an error, not a guess: silently defaulting "Middle" to
    // distance would put a mid-D guy on the wrong workouts all week.
    let group: ParsedGroup = null;
    if (groupText) {
      const found = GROUP_WORDS[groupText.toLowerCase().replace(/\s+/g, " ").trim()];
      if (!found) {
        errors.push({
          where: `Goals!${colLetter(cols.group as number)}${r}`,
          message: `"${groupText}" isn't a training group. Use Distance or Mid-D, or leave the cell blank to keep ${name || email} where they are.`,
        });
        continue;
      }
      group = found;
    }

    // ---- the two mileage cells ----
    // Independent of each other on purpose (locked 28): a blank weekly cell no
    // longer means "skip this athlete", it means "leave his weekly number
    // alone", and the same for a blank long run. That is what lets the coach
    // fill in only one of the two columns without wiping the other.
    const weekly = readMileage(rawGoal, name || email, "weekly goal", MAX_GOAL);
    if (weekly && !weekly.ok) {
      errors.push({ where: `Goals!${colLetter(cols.goal)}${r}`, message: weekly.message });
      continue;
    }
    const long =
      rawLong === null ? null : readMileage(rawLong, name || email, "long run", MAX_LONG_RUN);
    if (long && !long.ok) {
      errors.push({
        where: `Goals!${colLetter(cols.longRun as number)}${r}`,
        message: long.message,
      });
      continue;
    }

    if (!weekly) {
      // Not an error: the template ships the whole roster with the mileage
      // column empty, and a coach may legitimately leave someone blank
      // (injured, not travelling, not arrived yet). Collected and reported as
      // ONE line below rather than one warning per athlete — a 29-item list
      // is how a coach learns to ignore this panel, which is exactly when the
      // warning that matters gets missed.
      noMileage.push(name || email);
    } else if (long && long.value > weekly.value) {
      // A long run longer than the whole week cannot be what he meant. Warned,
      // not rejected: the numbers still post, and a coach who genuinely typed
      // it that way is not blocked at 9pm on a Sunday.
      longerThanWeek.push(name || email);
    }

    // A row carrying only a group change, or only a long run, is still worth
    // keeping — a coach can move a guy between squads, or set his long run,
    // without inventing a weekly number for him.
    if (!weekly && !long && !group) continue;

    seen.set(email, r);
    goals.push({
      row: r,
      name,
      email,
      goal: weekly ? weekly.value : null,
      label: weekly ? weekly.label : null,
      longRun: long ? long.value : null,
      longRunLabel: long ? long.label : null,
      group,
    });
  }

  if (noMileage.length > 0) {
    const shown = noMileage.slice(0, 8).join(", ");
    const rest = noMileage.length - 8;
    const where = `Goals!${colLetter(cols.goal)}`;
    warnings.push({
      where,
      message:
        noMileage.length === 1
          ? `${shown} has no mileage in column ${colLetter(cols.goal)} — no goal for them this week.`
          : `${noMileage.length} athletes have no mileage in column ${colLetter(cols.goal)} — no goal for them this week: ${shown}${rest > 0 ? `, and ${rest} more` : ""}.`,
    });
  }

  if (longerThanWeek.length > 0) {
    const shown = longerThanWeek.slice(0, 8).join(", ");
    const rest = longerThanWeek.length - 8;
    warnings.push({
      where: `Goals!${colLetter(cols.longRun as number)}`,
      message:
        longerThanWeek.length === 1
          ? `${shown} has a long run longer than his whole week's mileage. Check the two columns aren't swapped.`
          : `${longerThanWeek.length} athletes have a long run longer than their whole week's mileage: ${shown}${rest > 0 ? `, and ${rest} more` : ""}. Check the two columns aren't swapped.`,
    });
  }

  if (goals.length === 0 && errors.length === 0) {
    warnings.push({
      where: "Goals",
      message: "No athlete goals in this file — the plan will post, but nobody gets a mileage target.",
    });
  }

  // The two halves have to agree. A mid-D roster with an empty mid-D column is
  // a week where those guys open the app and see nothing — the single most
  // damaging way this file can be half-filled, and invisible unless we say so.
  // (previewUpload repeats this check against the athletes already marked mid-D
  // in the database, which this parser can't see.)
  const midInFile = goals.filter((g) => g.group === "mid").length;
  if (midInFile > 0 && noMid) {
    warnings.push({
      where: "Week Plan!D6:D12",
      message: `${midInFile} ${midInFile === 1 ? "athlete is" : "athletes are"} marked Mid-D, but the mid-distance column is empty — they'll see no workouts this week.`,
    });
  }
  if (midInFile === 0 && !noMid) {
    warnings.push({
      where: cols.group === null ? "Goals!row 1" : `Goals!${colLetter(cols.group)}`,
      message: "The mid-distance column has workouts in it, but nobody in this file is marked Mid-D. Anyone already set to Mid-D will still see them.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      weekStartISO: isoDate(weekDate as Date),
      plansDistance,
      plansMid,
      goals,
      warnings,
    },
  };
}
