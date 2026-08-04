/**
 * Hand-written row types mirroring supabase/migrations/0001_initial.sql
 * exactly. DATE columns arrive as "YYYY-MM-DD" strings; timestamptz as ISO
 * strings; numeric as JSON numbers.
 */

export type Role = "athlete" | "coach";
export type AthleteStatus = "active" | "injured" | "inactive" | "alum";
export type Slot = "AM" | "PM";

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
  distance_mi: number;
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
