import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fromISO, isoDate, mondayOf } from "@/lib/dates";
import type { AthleteWeek, DayReview, Log, Profile, WeekPlan } from "@/lib/types";

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
