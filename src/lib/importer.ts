import readXlsxFile from "read-excel-file/node";
import { isoDate, mondayOf } from "@/lib/dates";

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
  goal: number;
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

/** Accepts a real date cell, or text the coach typed as YYYY-MM-DD or M/D/YYYY. */
function readDate(v: Cell): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toLocalDate(v);

  const s = text(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
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
      errors.push({
        where: `Goals!C${r}`,
        message: `${name || email} has no weekly goal. Put their mileage target in column C.`,
      });
      continue;
    }
    const goal = typeof rawGoal === "number" ? rawGoal : Number(goalText);
    if (!Number.isFinite(goal)) {
      errors.push({
        where: `Goals!C${r}`,
        message: `"${goalText}" isn't a number. Weekly goals are miles, like 70.`,
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
    goals.push({ row: r, name, email, goal: Math.round(goal * 10) / 10 });
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
