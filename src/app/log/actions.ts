"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromISO, isoDate, mondayOf, todayET } from "@/lib/dates";
import type { Slot } from "@/lib/types";

export type SaveLogInput = {
  log_date: string; // "YYYY-MM-DD"
  slot: Slot;
  distance_mi: number;
  pace?: string;
  rpe?: number;
  pain_flag: boolean;
  pain_note?: string;
  question?: string;
  notes?: string;
};

export type SaveLogResult = { ok: true } | { ok: false; error: string };

const MAX_TEXT = 2000;

function cleanText(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/**
 * Save (create or update) one run. Athlete identity always comes from the
 * session — never from the client. Every save is live to the coach (locked
 * 12): there is no submit step anywhere.
 */
export async function saveLog(input: SaveLogInput): Promise<SaveLogResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in and try again." };

  // ---- validate everything server-side ----
  const date = fromISO(String(input.log_date));
  if (!date) return { ok: false, error: "That isn't a real date." };
  const logDate = isoDate(date);
  if (logDate > isoDate(todayET())) {
    return { ok: false, error: "Can't log a run that hasn't happened yet." };
  }

  if (input.slot !== "AM" && input.slot !== "PM") {
    return { ok: false, error: "Slot must be AM or PM." };
  }

  const distance = Number(input.distance_mi);
  if (!Number.isFinite(distance) || distance < 0 || distance > 40) {
    return { ok: false, error: "Distance must be a number between 0 and 40 miles." };
  }

  const pace = cleanText(input.pace);
  if (pace && pace.length > 10) {
    return { ok: false, error: "Pace should be short — like 6:45." };
  }

  let rpe: number | null = null;
  if (input.rpe !== undefined && input.rpe !== null) {
    if (!Number.isInteger(input.rpe) || input.rpe < 1 || input.rpe > 10) {
      return { ok: false, error: "Effort must be a whole number from 1 to 10." };
    }
    rpe = input.rpe;
  }

  const painFlag = input.pain_flag === true;
  const painNote = painFlag ? cleanText(input.pain_note) : null; // note rides with the flag
  const question = cleanText(input.question);
  const notes = cleanText(input.notes);
  for (const [label, v] of [
    ["Pain note", painNote],
    ["Question", question],
    ["Notes", notes],
  ] as const) {
    if (v && v.length > MAX_TEXT) {
      return { ok: false, error: `${label} is too long (max ${MAX_TEXT} characters).` };
    }
  }

  const row = {
    athlete_id: user.id,
    log_date: logDate,
    slot: input.slot,
    distance_mi: Math.round(distance * 10) / 10, // column is numeric(4,1)
    pace,
    rpe,
    pain_flag: painFlag,
    pain_note: painNote,
    question,
    notes,
  };

  // Upsert by (athlete_id, log_date, slot). The unique index is partial
  // (WHERE deleted_at IS NULL), which ON CONFLICT can't target through
  // PostgREST — so find the live row and update it, else insert. A race here
  // is theoretical at 24 athletes, and the index itself still backstops it.
  const { data: existing, error: findError } = await supabase
    .from("logs")
    .select("id")
    .eq("athlete_id", user.id)
    .eq("log_date", logDate)
    .eq("slot", input.slot)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) return { ok: false, error: "Couldn't save — try again." };

  const write = existing
    ? await supabase.from("logs").update(row).eq("id", existing.id)
    : await supabase.from("logs").insert(row);
  if (write.error) return { ok: false, error: "Couldn't save — try again." };

  // Make sure this week's sheet row exists. mileage_goal stays null — the
  // coach sets it. Not critical path: the run is already saved, so a failure
  // here shouldn't fail the save.
  await supabase.from("athlete_weeks").upsert(
    { athlete_id: user.id, week_start: isoDate(mondayOf(date)) },
    { onConflict: "athlete_id,week_start", ignoreDuplicates: true },
  );

  revalidatePath("/log");
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remove a mis-logged run (wrong day is a near-certain week-one event for a
 * backfilling team). Soft delete: sets deleted_at, so the partial unique index
 * frees the (date, slot) for a re-log and nothing is ever truly lost.
 * RLS's athlete_id check is the real boundary; the eq here is belt-and-braces.
 */
export async function deleteLog(logId: string): Promise<SaveLogResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in and try again." };
  if (!UUID.test(String(logId))) return { ok: false, error: "That run doesn't exist." };

  const { error } = await supabase
    .from("logs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", logId)
    .eq("athlete_id", user.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Couldn't remove it — try again." };

  revalidatePath("/log");
  return { ok: true };
}

export type SaveSummaryResult = { ok: true } | { ok: false; error: string };

/**
 * Save the week's SUMMARY box (locked 19) — the athlete's Sunday reflection,
 * editable any day of the week. Identity always comes from the session.
 * Creates the athlete_weeks row if missing (same pattern as saveLog); the
 * upsert only carries athlete_summary, so coach-owned columns (mileage_goal,
 * coach_comment, reviewed_at) are never touched.
 */
export async function saveSummary(
  weekStartISO: string,
  text: string,
): Promise<SaveSummaryResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in and try again." };

  // ---- validate everything server-side ----
  const parsed = fromISO(String(weekStartISO));
  if (!parsed) return { ok: false, error: "That isn't a real week." };
  const weekISO = isoDate(mondayOf(parsed)); // snap — the DB requires a Monday
  if (weekISO > isoDate(mondayOf(todayET()))) {
    return { ok: false, error: "That week hasn't started yet." };
  }

  const summary = typeof text === "string" ? text.trim() : "";
  if (summary.length > MAX_TEXT) {
    return { ok: false, error: `Summary is too long (max ${MAX_TEXT} characters).` };
  }

  const { error } = await supabase.from("athlete_weeks").upsert(
    { athlete_id: user.id, week_start: weekISO, athlete_summary: summary || null },
    { onConflict: "athlete_id,week_start" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath("/log");
  return { ok: true };
}
