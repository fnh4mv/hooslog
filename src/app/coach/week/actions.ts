"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach-auth";
import { fromISO } from "@/lib/dates";
import { parseMileageInput } from "@/lib/goal-input";
import { GROUPS, type TrainingGroup } from "@/lib/types";

/** Plans are free text but not a novel — matches the importer's own cap. */
const MAX_PLAN_CHARS = 500;

export type DraftRow = {
  email: string;
  group: TrainingGroup;
  goal: string;
  longRun: string;
};

export type WeekDraft = {
  weekStartISO: string;
  plans: { distance: string[]; mid: string[] };
  rows: DraftRow[];
};

/** `field` lets the browser put the message back on the box that caused it. */
export type PostError = {
  where: string;
  message: string;
  field?: { email: string; which: "goal" | "longRun" } | { day: number; group: TrainingGroup };
};

export type PostResult =
  | {
      ok: true;
      weekStartISO: string;
      goalsSet: number;
      movedToMid: string[];
      movedToDistance: string[];
    }
  | { ok: false; errors: PostError[] };

/**
 * Post a week built in the app.
 *
 * Writes through the SAME `import_week` RPC the spreadsheet uses (migration
 * 0012, v5), so both doors land plans, goals and squad moves in one
 * transaction with one set of rules. No new migration, no second write path
 * to keep in sync, and every previously posted week is untouched — this only
 * ever upserts the week it was given.
 *
 * Everything is re-validated here from the roster in the database. The browser
 * sends emails and figures; it does not get to decide who is on the team, and
 * a payload naming somebody who isn't is rejected rather than trusted.
 */
export async function postWeek(draft: WeekDraft): Promise<PostResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, errors: [{ where: "Account", message: auth.error }] };
  const { supabase } = auth;

  const errors: PostError[] = [];

  // ---- the week itself ----
  const weekStart = fromISO(draft.weekStartISO);
  if (!weekStart) {
    return { ok: false, errors: [{ where: "Week", message: "That isn't a real date." }] };
  }
  if (weekStart.getDay() !== 1) {
    return {
      ok: false,
      errors: [{ where: "Week", message: "A training week starts on a Monday." }],
    };
  }

  // ---- the two schedules ----
  for (const group of GROUPS) {
    const days = draft.plans[group];
    if (!Array.isArray(days) || days.length !== 7) {
      return {
        ok: false,
        errors: [{ where: "Schedule", message: "The week came through malformed — reload the page and try again." }],
      };
    }
    days.forEach((text, day) => {
      if ((text ?? "").length > MAX_PLAN_CHARS) {
        errors.push({
          where: "Schedule",
          message: `That day's workout is ${text.length} characters — keep it under ${MAX_PLAN_CHARS}.`,
          field: { day, group },
        });
      }
    });
  }

  // ---- the roster, from the database, not from the browser ----
  const { data: roster, error: rosterError } = await supabase
    .from("profiles")
    .select("email,name,training_group")
    .eq("role", "athlete")
    .in("status", ["active", "injured"])
    .is("deleted_at", null);
  if (rosterError) {
    return {
      ok: false,
      errors: [{ where: "Roster", message: "Nothing was saved — couldn't read the roster just now. Try posting again." }],
    };
  }
  const rosterEmails = new Set(
    ((roster as { email: string }[] | null) ?? []).map((p) => p.email),
  );

  // ---- every figure, through the same parser the boxes used ----
  const goals: {
    email: string;
    goal: number | null;
    label: string | null;
    long_run: number | null;
    long_run_label: string | null;
    group: TrainingGroup;
  }[] = [];

  const seen = new Set<string>();
  for (const row of draft.rows ?? []) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email) continue;
    if (!rosterEmails.has(email)) {
      // Can only happen if the roster changed under an open tab, or the
      // payload was tampered with. Either way: refuse, don't guess.
      errors.push({
        where: "Roster",
        message: `${email} isn't on the active roster any more — reload the page to pick up the current team.`,
      });
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);

    if (!GROUPS.includes(row.group)) {
      errors.push({
        where: "Group",
        message: `"${row.group}" isn't a training group.`,
        field: { email, which: "goal" },
      });
      continue;
    }

    const weekly = parseMileageInput(row.goal ?? "", "weekly goal");
    if (!weekly.ok) {
      errors.push({ where: "Weekly goal", message: weekly.message, field: { email, which: "goal" } });
    }
    const long = parseMileageInput(row.longRun ?? "", "long run");
    if (!long.ok) {
      errors.push({ where: "Long run", message: long.message, field: { email, which: "longRun" } });
    }
    if (!weekly.ok || !long.ok) continue;

    goals.push({
      email,
      goal: weekly.empty ? null : weekly.value,
      label: weekly.empty ? null : weekly.label,
      long_run: long.empty ? null : long.value,
      long_run_label: long.empty ? null : long.label,
      // Always explicit. The spreadsheet's blank-means-no-change is what left
      // twenty-seven athletes on the distance schedule after a mid-distance
      // week was posted; here the toggle always says what it says.
      group: row.group,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const { data, error } = await supabase.rpc("import_week", {
    p_week_start: draft.weekStartISO,
    p_plans_distance: draft.plans.distance.map((t) => (t ?? "").trim()),
    p_plans_mid: draft.plans.mid.map((t) => (t ?? "").trim()),
    p_goals: goals,
  });

  if (error) {
    return {
      ok: false,
      errors: [{ where: "Posting", message: `Nothing was saved. ${error.message}` }],
    };
  }

  const row = Array.isArray(data) ? data[0] : null;

  revalidatePath("/coach");
  revalidatePath("/coach/week");
  revalidatePath("/log");
  return {
    ok: true,
    weekStartISO: draft.weekStartISO,
    goalsSet: row?.goals_set ?? 0,
    movedToMid: row?.moved_to_mid ?? [],
    movedToDistance: row?.moved_to_distance ?? [],
  };
}
