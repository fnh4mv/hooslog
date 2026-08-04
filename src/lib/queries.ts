import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fromISO, isoDate } from "@/lib/dates";
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
