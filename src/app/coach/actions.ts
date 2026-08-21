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
 * The shared ✓ on one day (locked 16): the team's red-pen check, deliberately
 * NOT per-coach — either coach checking a day checks it for the program
 * (locked 7, same reasoning as the week's reviewed stamp). Comments moved to
 * their own per-coach table in 0009 (saveDayComment below).
 */
export async function saveDayCheck(
  athleteId: string,
  dateISO: string,
  checked: boolean,
): Promise<ActionResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, coachId } = auth;

  if (!UUID.test(String(athleteId))) return { ok: false, error: "Unknown athlete." };
  const date = fromISO(String(dateISO));
  if (!date) return { ok: false, error: "That isn't a real date." };
  const logDate = isoDate(date);

  if (!checked) {
    // Unchecking clears the row rather than keeping checked=false — the
    // athlete's feed never shows a blank card. (Any pre-0009 legacy comment
    // on the row was already copied into day_comments by the migration.)
    const { error } = await supabase
      .from("day_reviews")
      .update({ deleted_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .eq("log_date", logDate)
      .is("deleted_at", null);
    if (error) return { ok: false, error: "Couldn't save — try again." };
  } else {
    // unique(athlete_id, log_date) has no deleted_at predicate, so a
    // previously cleared check is revived by the same upsert.
    const { error } = await supabase.from("day_reviews").upsert(
      {
        athlete_id: athleteId,
        log_date: logDate,
        checked: true,
        coach_id: coachId,
        deleted_at: null,
      },
      { onConflict: "athlete_id,log_date" },
    );
    if (error) return { ok: false, error: "Couldn't save — try again." };
  }

  revalidatePath(`/coach/${athleteId}`);
  revalidatePath("/coach"); // the grid's alert strip keys off day actions
  return { ok: true };
}

/**
 * One coach's comment on one athlete-day (0009): same per-coach contract as
 * saveWeekComment — you only ever write your own row, both coaches' comments
 * show attributed, an empty save clears yours.
 */
export async function saveDayComment(
  athleteId: string,
  dateISO: string,
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

  if (!text) {
    const { error } = await supabase
      .from("day_comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .eq("log_date", logDate)
      .eq("coach_id", coachId)
      .is("deleted_at", null);
    if (error) return { ok: false, error: "Couldn't save — try again." };
    revalidatePath(`/coach/${athleteId}`);
    revalidatePath("/coach");
    return { ok: true };
  }

  const { data: me } = await supabase
    .from("profiles").select("name").eq("id", coachId).single();
  const coachName = (me?.name as string | undefined)?.trim() || "Coach";

  const { error } = await supabase.from("day_comments").upsert(
    {
      athlete_id: athleteId,
      log_date: logDate,
      coach_id: coachId,
      coach_name: coachName,
      comment: text,
      deleted_at: null,
    },
    { onConflict: "athlete_id,log_date,coach_id" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath(`/coach/${athleteId}`);
  revalidatePath("/coach");
  return { ok: true };
}

/**
 * One coach's comment on one athlete-week (0008). Each coach writes only
 * their OWN row — Dunbar and Bradley can both leave feedback on the same week
 * and neither ever touches the other's words, which also retires the
 * compare-and-swap this action used to need. An empty save clears the coach's
 * own comment (soft delete).
 */
export async function saveWeekComment(
  athleteId: string,
  weekStartISO: string,
  comment: string,
): Promise<ActionResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, coachId } = auth;

  if (!UUID.test(String(athleteId))) return { ok: false, error: "Unknown athlete." };
  const parsed = fromISO(String(weekStartISO));
  if (!parsed) return { ok: false, error: "That isn't a real week." };
  const weekISO = isoDate(mondayOf(parsed)); // the DB requires a Monday

  const text = cleanText(comment);
  if (text && text.length > MAX_TEXT) {
    return { ok: false, error: `Comment is too long (max ${MAX_TEXT} characters).` };
  }

  if (!text) {
    const { error } = await supabase
      .from("week_comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .eq("week_start", weekISO)
      .eq("coach_id", coachId)
      .is("deleted_at", null);
    if (error) return { ok: false, error: "Couldn't save — try again." };
    revalidatePath(`/coach/${athleteId}`);
    return { ok: true };
  }

  // coach_name rides on the row: athletes can't read coach profiles, but must
  // see who said what.
  const { data: me } = await supabase
    .from("profiles").select("name").eq("id", coachId).single();
  const coachName = (me?.name as string | undefined)?.trim() || "Coach";

  // unique(athlete_id, week_start, coach_id) is total, so this revives a
  // previously cleared comment instead of colliding with its soft-deleted row.
  const { error } = await supabase.from("week_comments").upsert(
    {
      athlete_id: athleteId,
      week_start: weekISO,
      coach_id: coachId,
      coach_name: coachName,
      comment: text,
      deleted_at: null,
    },
    { onConflict: "athlete_id,week_start,coach_id" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath(`/coach/${athleteId}`);
  return { ok: true };
}

/**
 * The shared "reviewed" stamp on athlete_weeks. Deliberately NOT per-coach:
 * the review queue is a team to-do list, not a scoreboard (locked 7) — either
 * coach marking a week reviewed clears it for both.
 */
export async function saveWeekReviewed(
  athleteId: string,
  weekStartISO: string,
  reviewed: boolean,
): Promise<ActionResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  if (!UUID.test(String(athleteId))) return { ok: false, error: "Unknown athlete." };
  const parsed = fromISO(String(weekStartISO));
  if (!parsed) return { ok: false, error: "That isn't a real week." };
  const weekISO = isoDate(mondayOf(parsed));

  // Upsert carries only the stamp — athlete_summary and mileage_goal are
  // never in the payload, so nothing of anyone else's can be overwritten.
  const { error } = await supabase.from("athlete_weeks").upsert(
    {
      athlete_id: athleteId,
      week_start: weekISO,
      reviewed_at: reviewed ? new Date().toISOString() : null,
    },
    { onConflict: "athlete_id,week_start" },
  );
  if (error) return { ok: false, error: "Couldn't save — try again." };

  revalidatePath(`/coach/${athleteId}`);
  revalidatePath("/coach");
  return { ok: true };
}
