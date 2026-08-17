"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach-auth";
import { fromISO, isoDate, mondayOf } from "@/lib/dates";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_TEXT = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/**
 * The red pen on one day (locked 16): a check, a comment, or both. Unchecking
 * with no comment clears the review entirely rather than leaving an empty row,
 * so the athlete's feedback feed never shows a blank card.
 *
 * No scores, ever (locked 7) — a day is checked or it isn't.
 */
export async function saveDayReview(
  athleteId: string,
  dateISO: string,
  checked: boolean,
  comment: string,
): Promise<ActionResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, coachId } = auth;

  if (!UUID.test(String(athleteId))) return { ok: false, error: "Unknown athlete." };
  const date = fromISO(String(dateISO));
  if (!date) return { ok: false, error: "That isn't a real date." };
  const logDate = isoDate(date);

  const text = cleanText(comment);
  if (text && text.length > MAX_TEXT) {
    return { ok: false, error: `Comment is too long (max ${MAX_TEXT} characters).` };
  }

  // Nothing to say and nothing checked = no review. Soft-delete so the
  // athlete's card disappears but the history stays.
  if (!checked && !text) {
    const { error } = await supabase
      .from("day_reviews")
      .update({ deleted_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .eq("log_date", logDate)
      .is("deleted_at", null);
    if (error) return { ok: false, error: "Couldn't save — try again." };
    revalidatePath(`/coach/${athleteId}`);
    return { ok: true };
  }

  // unique(athlete_id, log_date) has no deleted_at predicate, so a previously
  // cleared review is revived by the same upsert rather than colliding.
  const { error } = await supabase.from("day_reviews").upsert(
    {
      athlete_id: athleteId,
      log_date: logDate,
      checked,
      comment: text,
      coach_id: coachId,
      deleted_at: null,
    },
    { onConflict: "athlete_id,log_date" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath(`/coach/${athleteId}`);
  return { ok: true };
}

/**
 * The week-level comment and the "reviewed" stamp. Writes only coach-owned
 * columns — the payload never mentions athlete_summary, so an athlete editing
 * their reflection at the same moment can't be overwritten.
 */
export async function saveWeekReview(
  athleteId: string,
  weekStartISO: string,
  comment: string,
  reviewed: boolean,
): Promise<ActionResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  if (!UUID.test(String(athleteId))) return { ok: false, error: "Unknown athlete." };
  const parsed = fromISO(String(weekStartISO));
  if (!parsed) return { ok: false, error: "That isn't a real week." };
  const weekISO = isoDate(mondayOf(parsed)); // the DB requires a Monday

  const text = cleanText(comment);
  if (text && text.length > MAX_TEXT) {
    return { ok: false, error: `Comment is too long (max ${MAX_TEXT} characters).` };
  }

  const { error } = await supabase.from("athlete_weeks").upsert(
    {
      athlete_id: athleteId,
      week_start: weekISO,
      coach_comment: text,
      reviewed_at: reviewed ? new Date().toISOString() : null,
    },
    { onConflict: "athlete_id,week_start" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath(`/coach/${athleteId}`);
  revalidatePath("/coach");
  return { ok: true };
}
