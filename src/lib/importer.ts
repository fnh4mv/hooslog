import readXlsxFile from "read-excel-file/node";
import { isoDate, mondayOf, trainingTodayET } from "@/lib/dates";

/**
 * Parser for the coach's week-plan template
 * (docs/templates/hooslog_week_plan_template.xlsx). That file IS the format
 * contract — locked 23, template-first rather than parsing whatever Excel the
 * coach happens to have.
 *
 * Contract:
 *   "Week Plan" tab — B3 = the Monday date, C6:C12 = plan text for Mon…Sun
 *   "Goals"     tab — row 1 headers, rows 2+ = A name, B UVA email, C goal
 *
 * Every failure is a plain-English sentence naming the cell. A coach at 9pm on
 * a Sunday should never see a stack trace or the word "undefined".
 */

export type ImportError = { where: string; message: string };
export type ImportWarning = { where: string; message: string };

export type ParsedGoal = {
  row: number; // 1-based row in the Goals tab, for error messages
  name: string;
  email: string;
  /** The tracked number: the value itself, a range's midpoint, a minimum's floor. */
  goal: number;
  /** The goal as the coach wrote it ("55-60", "60+"); null for a plain number.
   *  Athletes see this; the bar math uses `goal`. */
  label: string | null;
};

export type ParsedTemplate = {
  weekStartISO: string; // always a Monday
  plans: string[]; // exactly 7; index 0 = Monday; "" = no plan that day
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
const MAX_PLAN_CHARS = 500;

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

  // ---- C6:C12: the seven days ----
  const plans: string[] = [];
  for (let i = 0; i < 7; i++) {
    const value = text(cell(planSheet, 6 + i, 3));
    if (value.length > MAX_PLAN_CHARS) {
      errors.push({
        where: `Week Plan!C${6 + i}`,
        message: `${DAYS[i]}'s plan is ${value.length} characters — keep it under ${MAX_PLAN_CHARS} so it fits on a phone.`,
      });
    }
    if (/\(example\b/i.test(value)) {
      warnings.push({
        where: `Week Plan!C${6 + i}`,
        message: `${DAYS[i]} still has the template's example text in it.`,
      });
    }
    plans.push(value);
  }
  if (plans.every((p) => p === "")) {
    warnings.push({
      where: "Week Plan!C6:C12",
      message: "No workouts filled in — this will post an empty week.",
    });
  }

  // ---- Goals tab: one athlete per row from row 2 ----
  const goals: ParsedGoal[] = [];
  const seen = new Map<string, number>();
  for (let r = 2; r <= goalSheet.length; r++) {
    const name = text(cell(goalSheet, r, 1));
    const email = text(cell(goalSheet, r, 2)).toLowerCase();
    const rawGoal = cell(goalSheet, r, 3);
    const goalText = text(rawGoal);

    if (!name && !email && !goalText) continue; // blank row, skip quietly

    if (email === EXAMPLE_EMAIL) {
      errors.push({
        where: `Goals!row ${r}`,
        message: "That's still the template's example row. Delete it and put your athletes in.",
      });
      continue;
    }

    if (!email) {
      errors.push({
        where: `Goals!B${r}`,
        message: `Row ${r} has no email${name ? ` (${name})` : ""}. The email is how the upload finds the athlete.`,
      });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ where: `Goals!B${r}`, message: `"${email}" isn't a valid email address.` });
      continue;
    }
    const dupe = seen.get(email);
    if (dupe) {
      errors.push({
        where: `Goals!B${r}`,
        message: `${email} appears twice (rows ${dupe} and ${r}). Keep one row per athlete.`,
      });
      continue;
    }

    if (!goalText) {
      // A warning, not an error: the pre-filled roster template ships every
      // athlete's name+email with the mileage column empty, and a coach may
      // legitimately leave someone blank (injured, not arrived yet). The row
      // is skipped loudly, never silently.
      warnings.push({
        where: `Goals!C${r}`,
        message: `${name || email} has no mileage in column C — skipped; they won't get a goal this week.`,
      });
      continue;
    }
    // Excel silently converts low ranges like "5-10" into dates the moment
    // they're typed. Catch that before it reads as a nonsense goal.
    if (rawGoal instanceof Date) {
      errors.push({
        where: `Goals!C${r}`,
        message: `${name || email}'s goal looks like Excel turned a range into a date. Type it with the word "to" (like 5 to 10), or format the cell as Text first.`,
      });
      continue;
    }

    let goal: number;
    let label: string | null = null;
    // Coaches write minimums — "60+" means at least sixty. Athletes see the
    // "60+" exactly as written; the bar quietly tracks the floor. (A typed
    // "+60" never reaches here: Excel itself reads that as the number 60.)
    const plus = /^(\d+(?:\.\d+)?)\s*\+$/.exec(goalText);
    // And ranges — "45-49", "45 – 49", "45 to 49". Shown as written; the bar
    // tracks the middle of the range.
    const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i.exec(goalText);
    if (plus) {
      goal = Number(plus[1]);
      label = goalText;
    } else if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo > hi) {
        errors.push({
          where: `Goals!C${r}`,
          message: `"${goalText}" is backwards — put the smaller number first, like ${hi}-${lo}.`,
        });
        continue;
      }
      goal = (lo + hi) / 2;
      label = goalText;
    } else {
      goal = typeof rawGoal === "number" ? rawGoal : Number(goalText);
    }
    if (!Number.isFinite(goal)) {
      errors.push({
        where: `Goals!C${r}`,
        message: `"${goalText}" isn't a number. Weekly goals are miles — like 70, a range like 45-49, or a minimum like 60+.`,
      });
      continue;
    }
    if (goal <= 0 || goal > MAX_GOAL) {
      errors.push({
        where: `Goals!C${r}`,
        message: `A weekly goal of ${goal} miles isn't right — it should be between 1 and ${MAX_GOAL}.`,
      });
      continue;
    }

    seen.set(email, r);
    goals.push({ row: r, name, email, goal: Math.round(goal * 10) / 10, label });
  }

  if (goals.length === 0 && errors.length === 0) {
    warnings.push({
      where: "Goals",
      message: "No athlete goals in this file — the plan will post, but nobody gets a mileage target.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      weekStartISO: isoDate(weekDate as Date),
      plans,
      goals,
      warnings,
    },
  };
}
