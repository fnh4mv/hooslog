import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fromISO, isoDate, mondayOf } from "@/lib/dates";
import { fullName, rosterKey } from "@/lib/names";
import type { AthleteWeek, DayReview, Log, LogKind, Profile, RunType, WeekPlan } from "@/lib/types";

export type WeekData = {
  profile: Profile;
  athleteWeek: AthleteWeek | null;
  plans: WeekPlan[];
  logs: Log[];
  reviews: DayReview[];
};

/**
 * Everything the athlete portal needs for one week: the athlete's profile,
 * their athlete_weeks row (null until first log or coach upload), the coach's
 * plan, and the athlete's logs + day reviews in [weekStart, weekStart+6].
 * Soft-deleted rows are excluded everywhere.
 */
export async function getWeekData(
  supabase: SupabaseClient,
  userId: string,
  weekStartISO: string,
): Promise<WeekData> {
  const weekStart = fromISO(weekStartISO);
  if (!weekStart) throw new Error(`getWeekData: bad week start "${weekStartISO}"`);
  const weekEndISO = isoDate(addDays(weekStart, 6));

  const [profileRes, weekRes, plansRes, logsRes, reviewsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("athlete_weeks")
      .select("*")
      .eq("athlete_id", userId)
      .eq("week_start", weekStartISO)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("week_plans")
      .select("*")
      .eq("week_start", weekStartISO)
      .is("deleted_at", null)
      .order("day"),
    supabase
      .from("logs")
      .select("*")
      .eq("athlete_id", userId)
      .gte("log_date", weekStartISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null)
      .order("log_date")
      .order("slot"),
    supabase
      .from("day_reviews")
      .select("*")
      .eq("athlete_id", userId)
      .gte("log_date", weekStartISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null),
  ]);

  if (profileRes.error || !profileRes.data) {
    throw new Error("getWeekData: profile not found");
  }

  return {
    profile: profileRes.data as Profile,
    athleteWeek: (weekRes.data as AthleteWeek | null) ?? null,
    plans: (plansRes.data as WeekPlan[] | null) ?? [],
    logs: (logsRes.data as Log[] | null) ?? [],
    reviews: (reviewsRes.data as DayReview[] | null) ?? [],
  };
}

export type HistoryWeek = {
  weekStart: string; // DATE, always a Monday
  mileageGoal: number | null;
  totalMiles: number; // rounded to 1 decimal
  daysLogged: number; // distinct days with at least one log
  reviewed: boolean; // athlete_weeks.reviewed_at set
};

/**
 * The athlete's past weeks, most recent first, excluding the week that starts
 * at beforeWeekISO (i.e. the current week) — for the History tab (locked 13).
 * ONE query per table across the whole range, grouped here — never a query
 * per week. A week appears if it has an athlete_weeks row or any logs;
 * soft-deleted rows are excluded everywhere.
 */
export async function getHistory(
  supabase: SupabaseClient,
  userId: string,
  beforeWeekISO: string,
  weeks = 16,
): Promise<HistoryWeek[]> {
  const beforeWeek = fromISO(beforeWeekISO);
  if (!beforeWeek) throw new Error(`getHistory: bad week start "${beforeWeekISO}"`);
  const rangeStartISO = isoDate(addDays(beforeWeek, -7 * weeks));
  const rangeEndISO = isoDate(addDays(beforeWeek, -1)); // Sunday of the last past week

  const [weeksRes, logsRes] = await Promise.all([
    supabase
      .from("athlete_weeks")
      .select("*")
      .eq("athlete_id", userId)
      .gte("week_start", rangeStartISO)
      .lt("week_start", beforeWeekISO)
      .is("deleted_at", null),
    supabase
      .from("logs")
      .select("*")
      .eq("athlete_id", userId)
      .gte("log_date", rangeStartISO)
      .lte("log_date", rangeEndISO)
      .is("deleted_at", null),
  ]);

  const byWeek = new Map<string, HistoryWeek>();
  const datesByWeek = new Map<string, Set<string>>();
  const entry = (weekStart: string): HistoryWeek => {
    let e = byWeek.get(weekStart);
    if (!e) {
      e = { weekStart, mileageGoal: null, totalMiles: 0, daysLogged: 0, reviewed: false };
      byWeek.set(weekStart, e);
    }
    return e;
  };

  for (const w of (weeksRes.data as AthleteWeek[] | null) ?? []) {
    const e = entry(w.week_start);
    e.mileageGoal = w.mileage_goal === null ? null : Number(w.mileage_goal);
    e.reviewed = w.reviewed_at !== null;
  }
  for (const l of (logsRes.data as Log[] | null) ?? []) {
    const d = fromISO(l.log_date);
    if (!d) continue;
    const weekStart = isoDate(mondayOf(d));
    entry(weekStart).totalMiles += Number(l.distance_mi);
    let dates = datesByWeek.get(weekStart);
    if (!dates) {
      dates = new Set();
      datesByWeek.set(weekStart, dates);
    }
    dates.add(l.log_date);
  }

  for (const e of byWeek.values()) {
    e.totalMiles = Math.round(e.totalMiles * 10) / 10;
    e.daysLogged = datesByWeek.get(e.weekStart)?.size ?? 0;
  }

  return [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

// ============================================================ coach portal

/**
 * One athlete × one day in the team grid.
 * - kind null + miles null = nothing logged.
 * - kind "run" = miles is the AM+PM sum; runType is the day's hardest run.
 * - kind "off" / "cross" = the day was reported as rest / cross-train (0 miles).
 */
export type GridCell = {
  miles: number | null;
  kind: LogKind | null;
  runType: RunType | null;
  painFlag: boolean;
  hasQuestion: boolean;
};

// Which run type wins when a day has more than one run: the hardest one is
// what a coach scanning the grid most wants to see.
const RUN_TYPE_RANK: Record<RunType, number> = { workout: 3, long: 2, aerobic: 1 };
function hardestRunType(a: RunType | null, b: RunType | null): RunType | null {
  if (!a) return b;
  if (!b) return a;
  return RUN_TYPE_RANK[a] >= RUN_TYPE_RANK[b] ? a : b;
}

export type GridRow = {
  athlete: Profile;
  cells: GridCell[]; // exactly 7, Monday-first
  totalMiles: number;
  mileageGoal: number | null;
  reviewed: boolean;
};

/** A pain flag or a question — the things the coach must not miss (locked 15). */
export type Alert = {
  athleteId: string;
  athleteName: string;
  dateISO: string;
  kind: "pain" | "question";
  detail: string;
};

export type CoachWeek = {
  rows: GridRow[];
  alerts: Alert[]; // newest first
  plans: WeekPlan[];
};

/** Roster scope: who appears in the grid. Alums and inactives drop off. */
const ACTIVE_STATUSES = ["active", "injured"];

/**
 * The whole team's week in one pass: roster × 7 days of logs, plus each
 * athlete's goal and review state, plus every pain flag and question raised
 * that week.
 *
 * One query per table across the entire roster and range — never a query per
 * athlete, or the grid would fire 24× on every page load. Coach RLS
 * (`is_coach()`) is what authorizes the cross-athlete reads; this function
 * assumes the caller already passed through `src/app/coach/layout.tsx`.
 */
export async function getCoachWeek(
  supabase: SupabaseClient,
  weekStartISO: string,
): Promise<CoachWeek> {
  const weekStart = fromISO(weekStartISO);
  if (!weekStart) throw new Error(`getCoachWeek: bad week start "${weekStartISO}"`);
  const weekEndISO = isoDate(addDays(weekStart, 6));

  const [rosterRes, weeksRes, logsRes, plansRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "athlete")
      .in("status", ACTIVE_STATUSES)
      .is("deleted_at", null),
    supabase
      .from("athlete_weeks")
      .select("*")
      .eq("week_start", weekStartISO)
      .is("deleted_at", null),
    supabase
      .from("logs")
      .select("*")
      .gte("log_date", weekStartISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null)
      .order("log_date")
      .order("slot"),
    supabase
      .from("week_plans")
      .select("*")
      .eq("week_start", weekStartISO)
      .is("deleted_at", null)
      .order("day"),
  ]);

  const roster = ((rosterRes.data as Profile[] | null) ?? []).sort((a, b) =>
    rosterKey(a).localeCompare(rosterKey(b)),
  );

  const weekByAthlete = new Map<string, AthleteWeek>();
  for (const w of (weeksRes.data as AthleteWeek[] | null) ?? []) {
    weekByAthlete.set(w.athlete_id, w);
  }

  const emptyCells = (): GridCell[] =>
    Array.from({ length: 7 }, () => ({
      miles: null,
      kind: null,
      runType: null,
      painFlag: false,
      hasQuestion: false,
    }));
  const cellsByAthlete = new Map<string, GridCell[]>();
  const nameById = new Map(roster.map((a) => [a.id, fullName(a)]));
  const alerts: Alert[] = [];

  for (const log of (logsRes.data as Log[] | null) ?? []) {
    // A log from someone off the roster (alum, deactivated) is skipped rather
    // than crashing the grid — the row it belongs to no longer exists.
    if (!nameById.has(log.athlete_id)) continue;

    const day = fromISO(log.log_date);
    if (!day) continue;
    const idx = Math.round((day.getTime() - weekStart.getTime()) / 86_400_000);
    if (idx < 0 || idx > 6) continue;

    let cells = cellsByAthlete.get(log.athlete_id);
    if (!cells) {
      cells = emptyCells();
      cellsByAthlete.set(log.athlete_id, cells);
    }
    const cell = cells[idx];
    // Off/cross is a single entry for the day; a run sums AM+PM. Either kind of
    // entry can carry the flag or question.
    if (log.kind === "off" || log.kind === "cross") {
      cell.kind = log.kind;
    } else {
      cell.kind = "run";
      cell.miles = (cell.miles ?? 0) + Number(log.distance_mi);
      cell.runType = hardestRunType(cell.runType, log.run_type);
    }
    cell.painFlag ||= log.pain_flag;
    const question = log.question?.trim();
    cell.hasQuestion ||= Boolean(question);

    const athleteName = nameById.get(log.athlete_id) as string;
    if (log.pain_flag) {
      alerts.push({
        athleteId: log.athlete_id,
        athleteName,
        dateISO: log.log_date,
        kind: "pain",
        detail: log.pain_note?.trim() || "no detail given",
      });
    }
    if (question) {
      alerts.push({
        athleteId: log.athlete_id,
        athleteName,
        dateISO: log.log_date,
        kind: "question",
        detail: question,
      });
    }
  }

  const rows: GridRow[] = roster.map((athlete) => {
    const cells = cellsByAthlete.get(athlete.id) ?? emptyCells();
    let total = 0;
    for (const c of cells) {
      if (c.miles !== null) {
        c.miles = Math.round(c.miles * 10) / 10;
        total += c.miles;
      }
    }
    const week = weekByAthlete.get(athlete.id);
    return {
      athlete,
      cells,
      totalMiles: Math.round(total * 10) / 10,
      mileageGoal: week?.mileage_goal == null ? null : Number(week.mileage_goal),
      reviewed: Boolean(week?.reviewed_at),
    };
  });

  // Pain before questions, then newest day first: the order the coach should
  // work them in.
  alerts.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "pain" ? -1 : 1;
    return a.athleteName.localeCompare(b.athleteName);
  });

  return { rows, alerts, plans: (plansRes.data as WeekPlan[] | null) ?? [] };
}

type RosterEntry = { id: string; name: string; email: string };

export type CoachAthleteWeek = WeekData & {
  /** Roster neighbours, so Sunday grading is one continuous flow. */
  prevAthleteId: string | null;
  nextAthleteId: string | null;
  position: { index: number; total: number };
};

/**
 * One athlete's full week for the drill-in, plus prev/next roster neighbours.
 * Reuses `getWeekData` — the coach reads the exact rows the athlete sees, so
 * there is only ever one shape of "a week" in the app.
 */
export async function getCoachAthleteWeek(
  supabase: SupabaseClient,
  athleteId: string,
  weekStartISO: string,
): Promise<CoachAthleteWeek> {
  const [weekData, rosterRes] = await Promise.all([
    getWeekData(supabase, athleteId, weekStartISO),
    supabase
      .from("profiles")
      .select("id,name,email")
      .eq("role", "athlete")
      .in("status", ACTIVE_STATUSES)
      .is("deleted_at", null),
  ]);

  const roster = ((rosterRes.data as RosterEntry[] | null) ?? []).sort((a, b) =>
    rosterKey(a).localeCompare(rosterKey(b)),
  );
  const i = roster.findIndex((p) => p.id === athleteId);

  return {
    ...weekData,
    prevAthleteId: i > 0 ? roster[i - 1].id : null,
    nextAthleteId: i >= 0 && i < roster.length - 1 ? roster[i + 1].id : null,
    position: { index: i, total: roster.length },
  };
}
