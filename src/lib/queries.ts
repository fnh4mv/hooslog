import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fromISO, isoDate, mondayOf } from "@/lib/dates";
import { rosterKey, shortName } from "@/lib/names";
import { formatMileageInput } from "@/lib/goal-input";
import { GROUPS } from "@/lib/types";
import type { AthleteWeek, DayComment, DayReview, Log, LogKind, Profile, RunType, TrainingGroup, WeekComment, WeekPlan } from "@/lib/types";

export type WeekData = {
  profile: Profile;
  athleteWeek: AthleteWeek | null;
  /** Only the plans for this athlete's own training group (0011). */
  plans: WeekPlan[];
  logs: Log[];
  reviews: DayReview[];
  /** Every coach's comment on this week (0008) — one row per coach. */
  weekComments: WeekComment[];
  /** Every coach's per-day comments in this week (0009). */
  dayComments: DayComment[];
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

  const [profileRes, weekRes, plansRes, logsRes, reviewsRes, commentsRes, dayCommentsRes] = await Promise.all([
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
    supabase
      .from("week_comments")
      .select("*")
      .eq("athlete_id", userId)
      .eq("week_start", weekStartISO)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("day_comments")
      .select("*")
      .eq("athlete_id", userId)
      .gte("log_date", weekStartISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  if (profileRes.error || !profileRes.data) {
    throw new Error("getWeekData: profile not found");
  }

  const profile = profileRes.data as Profile;
  // Both groups' plans come back in one query (14 rows at most) and are
  // filtered here rather than in a second round trip that would have to wait
  // on the profile. `?? "distance"` covers the window before 0011 is applied:
  // the column doesn't exist yet, every plan row is the distance week, and the
  // athlete still sees it instead of an empty week.
  const group: TrainingGroup = profile.training_group ?? "distance";
  const allPlans = (plansRes.data as WeekPlan[] | null) ?? [];
  const plans = allPlans.some((p) => p.training_group)
    ? allPlans.filter((p) => (p.training_group ?? "distance") === group)
    : allPlans;

  return {
    profile,
    athleteWeek: (weekRes.data as AthleteWeek | null) ?? null,
    plans,
    logs: (logsRes.data as Log[] | null) ?? [],
    reviews: (reviewsRes.data as DayReview[] | null) ?? [],
    // ?? [] also covers the window before migrations 0008/0009 are pasted:
    // the query errors, comments simply don't render, nothing crashes.
    weekComments: (commentsRes.data as WeekComment[] | null) ?? [],
    dayComments: (dayCommentsRes.data as DayComment[] | null) ?? [],
  };
}

export type HistoryWeek = {
  weekStart: string; // DATE, always a Monday
  mileageGoal: number | null;
  goalLabel: string | null; // as written ("55-60"); null = show the number
  longRunGoal: number | null; // the week's long run target (0012); null = none set
  longRunLabel: string | null; // as written ("14-16"); null = show the number
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
      e = {
        weekStart,
        mileageGoal: null,
        goalLabel: null,
        longRunGoal: null,
        longRunLabel: null,
        totalMiles: 0,
        daysLogged: 0,
        reviewed: false,
      };
      byWeek.set(weekStart, e);
    }
    return e;
  };

  for (const w of (weeksRes.data as AthleteWeek[] | null) ?? []) {
    const e = entry(w.week_start);
    e.mileageGoal = w.mileage_goal === null ? null : Number(w.mileage_goal);
    e.goalLabel = w.goal_label ?? null;
    // ?? null also covers the window before 0012 is applied: the column simply
    // isn't in the row yet, and nothing renders.
    e.longRunGoal = w.long_run_goal == null ? null : Number(w.long_run_goal);
    e.longRunLabel = w.long_run_label ?? null;
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
 * - crossToo = the day ALSO had a cross-train alongside a run (evening bike
 *   after a morning run) — the run stays the cell's face, this adds a mark.
 */
export type GridCell = {
  miles: number | null;
  kind: LogKind | null;
  runType: RunType | null;
  painFlag: boolean;
  hasQuestion: boolean;
  crossToo: boolean;
};

// Which run type wins when a day has more than one run: the hardest one is
// what a coach scanning the grid most wants to see.
const RUN_TYPE_RANK: Record<RunType, number> = { workout: 4, long: 3, medium: 2, aerobic: 1 };
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
  /** The goal as the coach wrote it ("55-60"); null = show the number. */
  goalLabel: string | null;
  /** The week's long run target (0012); null = the coach didn't set one. */
  longRunGoal: number | null;
  /** The long run as written ("14-16"); null = show the number. */
  longRunLabel: string | null;
  reviewed: boolean;
  group: TrainingGroup;
};

/** A pain flag or a question — the things the coach must not miss (locked 15). */
export type Alert = {
  athleteId: string;
  athleteName: string;
  dateISO: string;
  kind: "pain" | "question";
  detail: string;
  /** The coach has reviewed this day (check or comment) since it was last
   *  edited — handled alerts drop out of the strip's active list. */
  handled: boolean;
};

/** One squad's slice of the week: its roster and its own seven-day plan. */
export type CoachSquad = {
  group: TrainingGroup;
  rows: GridRow[];
  /** Exactly 7, Monday-first; "" = no plan that day. */
  plans: string[];
  hasPlans: boolean;
};

export type CoachWeek = {
  /** Every athlete, both squads — for counts and the review nudge. */
  rows: GridRow[];
  /** The roster split by training group (0011, locked 26). Distance first.
   *  A squad with no athletes AND no plan is omitted, so a program that never
   *  uses mid-distance never sees an empty second section. */
  squads: CoachSquad[];
  alerts: Alert[]; // newest first
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
  // Alerts reach back before the week starts: a pain flag logged Sunday night
  // belongs to last week, but the coach opens Monday on THIS week and must
  // still see it. Cells only ever use in-week logs (see the index guard below).
  const ALERT_LOOKBACK_DAYS = 3;
  const alertFromISO = isoDate(addDays(weekStart, -ALERT_LOOKBACK_DAYS));

  const [rosterRes, weeksRes, logsRes, plansRes, reviewsRes, dayCommentsRes] = await Promise.all([
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
      .gte("log_date", alertFromISO)
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
    supabase
      .from("day_reviews")
      .select("athlete_id, log_date, updated_at")
      .gte("log_date", alertFromISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null),
    supabase
      .from("day_comments")
      .select("athlete_id, log_date, updated_at")
      .gte("log_date", alertFromISO)
      .lte("log_date", weekEndISO)
      .is("deleted_at", null),
  ]);

  const roster = ((rosterRes.data as Profile[] | null) ?? []).sort((a, b) =>
    rosterKey(a).localeCompare(rosterKey(b)),
  );

  // When did a coach last act on each day — a ✓ (day_reviews) OR a per-coach
  // day comment (0009)? Either retires the day's alerts from the active
  // strip. Compared against the log's own updated_at below: an entry edited
  // AFTER the coach acted — a new pain note, a changed question, even a fixed
  // distance — brings the alert back rather than hiding behind Tuesday's
  // check-off.
  const dayHandledAt = new Map<string, number>();
  const noteAction = (r: { athlete_id: string; log_date: string; updated_at: string }) => {
    const key = `${r.athlete_id}|${r.log_date}`;
    const t = Date.parse(r.updated_at);
    const prev = dayHandledAt.get(key);
    if (prev === undefined || t > prev) dayHandledAt.set(key, t);
  };
  for (const r of (reviewsRes.data as
    | Pick<DayReview, "athlete_id" | "log_date" | "updated_at">[]
    | null) ?? []) noteAction(r);
  for (const r of (dayCommentsRes.data as
    | Pick<DayComment, "athlete_id" | "log_date" | "updated_at">[]
    | null) ?? []) noteAction(r);
  const isHandled = (log: Log): boolean => {
    const acted = dayHandledAt.get(`${log.athlete_id}|${log.log_date}`);
    return acted !== undefined && acted >= Date.parse(log.updated_at);
  };

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
      crossToo: false,
    }));
  const cellsByAthlete = new Map<string, GridCell[]>();
  // shortName ("B. McMahon") — the coach portal's single name format.
  const nameById = new Map(roster.map((a) => [a.id, shortName(a)]));
  const alerts: Alert[] = [];

  for (const log of (logsRes.data as Log[] | null) ?? []) {
    // A log from someone off the roster (alum, deactivated) is skipped rather
    // than crashing the grid — the row it belongs to no longer exists.
    if (!nameById.has(log.athlete_id)) continue;

    const day = fromISO(log.log_date);
    if (!day) continue;
    const idx = Math.round((day.getTime() - weekStart.getTime()) / 86_400_000);

    // Out-of-week rows (the alert lookback) contribute alerts only — never
    // mileage, never a grid cell.
    if (idx < 0 || idx > 6) {
      const athleteName = nameById.get(log.athlete_id) as string;
      const handled = isHandled(log);
      if (log.pain_flag) {
        alerts.push({
          athleteId: log.athlete_id, athleteName, dateISO: log.log_date,
          kind: "pain", detail: log.pain_note?.trim() || "no detail given", handled,
        });
      }
      const q = log.question?.trim();
      if (q) {
        alerts.push({
          athleteId: log.athlete_id, athleteName, dateISO: log.log_date,
          kind: "question", detail: q, handled,
        });
      }
      continue;
    }

    let cells = cellsByAthlete.get(log.athlete_id);
    if (!cells) {
      cells = emptyCells();
      cellsByAthlete.set(log.athlete_id, cells);
    }
    const cell = cells[idx];
    // Off is a single entry for the day; a run sums AM+PM; a cross-train can
    // stand alone OR ride alongside a run (evening bike after a morning run) —
    // a run always stays the cell's face. Any entry can carry the flag or
    // question.
    if (log.kind === "off") {
      cell.kind = "off";
    } else if (log.kind === "cross") {
      if (cell.kind === "run") cell.crossToo = true;
      else cell.kind = "cross";
    } else {
      if (cell.kind === "cross") cell.crossToo = true;
      cell.kind = "run";
      cell.miles = (cell.miles ?? 0) + Number(log.distance_mi);
      cell.runType = hardestRunType(cell.runType, log.run_type);
    }
    cell.painFlag ||= log.pain_flag;
    const question = log.question?.trim();
    cell.hasQuestion ||= Boolean(question);

    const athleteName = nameById.get(log.athlete_id) as string;
    const handled = isHandled(log);
    if (log.pain_flag) {
      alerts.push({
        athleteId: log.athlete_id,
        athleteName,
        dateISO: log.log_date,
        kind: "pain",
        detail: log.pain_note?.trim() || "no detail given",
        handled,
      });
    }
    if (question) {
      alerts.push({
        athleteId: log.athlete_id,
        athleteName,
        dateISO: log.log_date,
        kind: "question",
        detail: question,
        handled,
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
      goalLabel: week?.goal_label ?? null,
      // ?? null also covers the window before 0012 is applied.
      longRunGoal: week?.long_run_goal == null ? null : Number(week.long_run_goal),
      longRunLabel: week?.long_run_label ?? null,
      reviewed: Boolean(week?.reviewed_at),
      // ?? "distance" also covers the window before 0011 is applied.
      group: athlete.training_group ?? "distance",
    };
  });

  // Unhandled first, then pain before questions, then newest day first: the
  // order the coach should work them in.
  alerts.sort((a, b) => {
    if (a.handled !== b.handled) return a.handled ? 1 : -1;
    if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "pain" ? -1 : 1;
    return a.athleteName.localeCompare(b.athleteName);
  });

  // Split the week's plan rows by group into two Monday-first arrays.
  const planText: Record<TrainingGroup, string[]> = {
    distance: Array.from({ length: 7 }, () => ""),
    mid: Array.from({ length: 7 }, () => ""),
  };
  for (const p of (plansRes.data as WeekPlan[] | null) ?? []) {
    if (p.day < 0 || p.day > 6) continue;
    planText[(p.training_group ?? "distance") as TrainingGroup][p.day] = p.plan_text ?? "";
  }

  const squads: CoachSquad[] = GROUPS.map((group) => {
    const squadRows = rows.filter((r) => r.group === group);
    const plans = planText[group];
    return {
      group,
      rows: squadRows,
      plans,
      hasPlans: plans.some((t) => t.trim()),
    };
  }).filter((s, i) => i === 0 || s.rows.length > 0 || s.hasPlans);

  return { rows, squads, alerts };
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

// ===========================================================================
// Week builder (in-app "Post a week")
// ===========================================================================

/** One row of the builder's roster grid. Goal/long run come back as the text
 *  the coach typed, so loading a week and re-posting it unchanged is a no-op. */
export type BuilderAthlete = {
  id: string;
  name: string;
  short: string;
  email: string;
  group: TrainingGroup;
  goal: string;
  longRun: string;
};

export type BuilderPlans = Record<TrainingGroup, string[]>; // 7 each, Monday-first

export type BuilderWeek = {
  weekStartISO: string;
  plans: BuilderPlans;
  athletes: BuilderAthlete[];
  /** A plan already exists for this week — posting replaces it. */
  alreadyPosted: boolean;
  /** The most recent week posted BEFORE this one. This is what makes the
   *  builder faster than the spreadsheet: most weeks are last week with a few
   *  numbers changed, and the coach's own habit is to open last week's file. */
  previous: {
    weekStartISO: string;
    plans: BuilderPlans;
    /** by email → the boxes, pre-formatted */
    goals: Record<string, { goal: string; longRun: string }>;
  } | null;
};

function emptyPlans(): BuilderPlans {
  return { distance: Array(7).fill(""), mid: Array(7).fill("") };
}

function plansFromRows(rows: Pick<WeekPlan, "training_group" | "day" | "plan_text">[]): BuilderPlans {
  const plans = emptyPlans();
  for (const r of rows) {
    const g = (r.training_group ?? "distance") as TrainingGroup;
    if (!GROUPS.includes(g)) continue;
    if (r.day < 0 || r.day > 6) continue;
    plans[g][r.day] = r.plan_text ?? "";
  }
  return plans;
}

/**
 * Everything the in-app week builder needs, in one round trip per concern.
 *
 * The roster is READ FROM THE DATABASE, which is the whole point: the
 * spreadsheet re-sends thirty-one names and emails every single week, and
 * every bug class it produced — a counter row parsed as an athlete, an email
 * that matches nobody, a blank GROUP column, a reordered column — comes from
 * the coach re-supplying data the app already has.
 */
export async function getWeekBuilder(
  supabase: SupabaseClient,
  weekStartISO: string,
): Promise<BuilderWeek> {
  const weekStart = fromISO(weekStartISO);
  if (!weekStart) throw new Error(`getWeekBuilder: bad week start "${weekStartISO}"`);

  const [rosterRes, weeksRes, plansRes, prevPlanRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,name,email,training_group")
      .eq("role", "athlete")
      .in("status", ACTIVE_STATUSES)
      .is("deleted_at", null),
    supabase
      .from("athlete_weeks")
      .select("athlete_id,mileage_goal,goal_label,long_run_goal,long_run_label")
      .eq("week_start", weekStartISO)
      .is("deleted_at", null),
    supabase
      .from("week_plans")
      .select("training_group,day,plan_text")
      .eq("week_start", weekStartISO)
      .is("deleted_at", null),
    // The most recent week with a plan on it, strictly before this one.
    supabase
      .from("week_plans")
      .select("week_start")
      .lt("week_start", weekStartISO)
      .is("deleted_at", null)
      .order("week_start", { ascending: false })
      .limit(1),
  ]);

  type RosterRow = { id: string; name: string; email: string; training_group: TrainingGroup | null };
  type GoalRow = Pick<AthleteWeek, "athlete_id" | "mileage_goal" | "goal_label" | "long_run_goal" | "long_run_label">;

  const roster = ((rosterRes.data as RosterRow[] | null) ?? []).slice();
  const goalsByAthlete = new Map(
    (((weeksRes.data as GoalRow[] | null) ?? [])).map((w) => [w.athlete_id, w]),
  );

  const athletes: BuilderAthlete[] = roster
    .sort((a, b) => rosterKey(a).localeCompare(rosterKey(b)))
    .map((p) => {
      const w = goalsByAthlete.get(p.id);
      return {
        id: p.id,
        name: p.name,
        short: shortName(p),
        email: p.email,
        group: (p.training_group ?? "distance") as TrainingGroup,
        goal: formatMileageInput(w?.mileage_goal, w?.goal_label),
        longRun: formatMileageInput(w?.long_run_goal, w?.long_run_label),
      };
    });

  const planRows = (plansRes.data as Pick<WeekPlan, "training_group" | "day" | "plan_text">[] | null) ?? [];

  // ---- last posted week, for "start from last week" ----
  const prevISO = ((prevPlanRes.data as { week_start: string }[] | null) ?? [])[0]?.week_start ?? null;
  let previous: BuilderWeek["previous"] = null;
  if (prevISO) {
    const [prevPlans, prevGoals] = await Promise.all([
      supabase
        .from("week_plans")
        .select("training_group,day,plan_text")
        .eq("week_start", prevISO)
        .is("deleted_at", null),
      supabase
        .from("athlete_weeks")
        .select("athlete_id,mileage_goal,goal_label,long_run_goal,long_run_label")
        .eq("week_start", prevISO)
        .is("deleted_at", null),
    ]);
    const byId = new Map(roster.map((p) => [p.id, p.email]));
    const goals: Record<string, { goal: string; longRun: string }> = {};
    for (const w of ((prevGoals.data as GoalRow[] | null) ?? [])) {
      const email = byId.get(w.athlete_id);
      if (!email) continue; // someone who has since left the roster
      goals[email] = {
        goal: formatMileageInput(w.mileage_goal, w.goal_label),
        longRun: formatMileageInput(w.long_run_goal, w.long_run_label),
      };
    }
    previous = {
      weekStartISO: prevISO,
      plans: plansFromRows(
        (prevPlans.data as Pick<WeekPlan, "training_group" | "day" | "plan_text">[] | null) ?? [],
      ),
      goals,
    };
  }

  return {
    weekStartISO,
    plans: plansFromRows(planRows),
    athletes,
    alreadyPosted: planRows.length > 0,
    previous,
  };
}
