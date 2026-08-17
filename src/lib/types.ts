/**
 * Hand-written row types mirroring supabase/migrations/0001_initial.sql
 * exactly. DATE columns arrive as "YYYY-MM-DD" strings; timestamptz as ISO
 * strings; numeric as JSON numbers.
 */

export type Role = "athlete" | "coach";
export type AthleteStatus = "active" | "injured" | "inactive" | "alum";
export type Slot = "AM" | "PM";

/** What a day was: a run, a planned off day, or a cross-train day (migration 0004). */
export type LogKind = "run" | "off" | "cross";
/** Run classification, runs only. Aerobic = the everyday baseline. */
export type RunType = "workout" | "long" | "aerobic";

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  workout: "Workout",
  long: "Long run",
  // Stored value stays "aerobic" (internal); the team calls this a training run
  // (TR) — the everyday baseline run.
  aerobic: "Training run",
};
/** Short mark for the dense coach grid; aerobic stays unmarked (it's the baseline). */
export const RUN_TYPE_MARKS: Record<RunType, string> = {
  workout: "W",
  long: "L",
  aerobic: "",
};
export const KIND_LABELS: Record<Exclude<LogKind, "run">, string> = {
  off: "Off day",
  cross: "Cross-train",
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AthleteStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AthleteWeek = {
  id: string;
  athlete_id: string;
  week_start: string; // DATE, always a Monday
  mileage_goal: number | null; // coach-set weekly goal (locked 18)
  athlete_summary: string | null;
  coach_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type WeekPlan = {
  id: string;
  week_start: string; // DATE, always a Monday
  day: number; // 0 = Monday … 6 = Sunday
  plan_text: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Log = {
  id: string;
  athlete_id: string;
  log_date: string; // DATE
  slot: Slot;
  kind: LogKind; // 'run' | 'off' | 'cross' (migration 0004)
  run_type: RunType | null; // runs only; null = unspecified
  distance_mi: number; // 0 for off/cross
  pace: string | null; // as typed, e.g. "6:47"
  rpe: number | null; // 1–10
  pain_flag: boolean;
  pain_note: string | null;
  question: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DayReview = {
  id: string;
  athlete_id: string;
  log_date: string; // DATE
  checked: boolean;
  comment: string | null;
  coach_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
