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

/** The coach-owned review state of one week, as a client last saw it. */
export type WeekReviewState = { comment: string | null; reviewed: boolean };

export type WeekReviewResult =
  | { ok: true; saved: WeekReviewState }
  /** `current` present = the week changed under this tab; nothing was written. */
  | { ok: false; error: string; current?: WeekReviewState };

/**
 * The week-level comment and the "reviewed" stamp. Writes only coach-owned
 * columns — the payload never mentions athlete_summary, so an athlete editing
 * their reflection at the same moment can't be overwritten.
 *
 * Concurrency: the write is a compare-and-swap against `expected` — the
 * comment/reviewed state this tab loaded. Two coaches (or one stale tab)
 * can no longer silently erase each other; the loser is told what the week
 * says now and can save again to replace it deliberately. The CAS runs on
 * the coach-owned columns rather than updated_at so an athlete saving their
 * summary into the same row never triggers a false conflict.
 */
export async function saveWeekReview(
  athleteId: string,
  weekStartISO: string,
  comment: string,
  reviewed: boolean,
  expected: WeekReviewState,
): Promise<WeekReviewResult> {
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

  const payload = {
    coach_comment: text,
    reviewed_at: reviewed ? new Date().toISOString() : null,
  };

  // The comment is normalized (trimmed, "" → null) the same way before every
  // save, so comparing against what this tab last saved is exact.
  const expectedComment = cleanText(expected?.comment);
  const expectedReviewed = expected?.reviewed === true;

  let update = supabase
    .from("athlete_weeks")
    .update(payload)
    .eq("athlete_id", athleteId)
    .eq("week_start", weekISO)
    .is("deleted_at", null);
  update =
    expectedComment === null
      ? update.is("coach_comment", null)
      : update.eq("coach_comment", expectedComment);
  update = expectedReviewed
    ? update.not("reviewed_at", "is", null)
    : update.is("reviewed_at", null);
  const { data: updated, error } = await update.select("athlete_id");
  if (error) return { ok: false, error: "Couldn't save — try again." };

  if (!updated || updated.length === 0) {
    // Zero rows: either the week row doesn't exist yet, or someone else
    // changed the review after this tab loaded it. Look and see which.
    const { data: row, error: readError } = await supabase
      .from("athlete_weeks")
      .select("coach_comment, reviewed_at")
      .eq("athlete_id", athleteId)
      .eq("week_start", weekISO)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) return { ok: false, error: "Couldn't save — try again." };

    if (row) {
      const current: WeekReviewState = {
        comment: (row.coach_comment as string | null) ?? null,
        reviewed: row.reviewed_at !== null,
      };
      const now = current.comment
        ? `It now says: “${current.comment.length > 180 ? `${current.comment.slice(0, 179)}…` : current.comment}”`
        : "Its comment is now empty";
      return {
        ok: false,
        current,
        error: `Not saved — this week's review changed after you opened it (the other coach, or another tab). ${now}. Your text is still here; save again to replace it.`,
      };
    }

    // First write for this week. A plain insert (not upsert) so a concurrent
    // first write collides here instead of silently winning.
    const { error: insertError } = await supabase
      .from("athlete_weeks")
      .insert({ athlete_id: athleteId, week_start: weekISO, ...payload });
    if (insertError) {
      return { ok: false, error: "Couldn't save — someone may have just written this week. Try again." };
    }
  }

  revalidatePath(`/coach/${athleteId}`);
  revalidatePath("/coach");
  return { ok: true, saved: { comment: text, reviewed } };
}
