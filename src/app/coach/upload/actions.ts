"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach-auth";
import { parseTemplate, type ImportError, type ImportWarning, type ParsedGroup } from "@/lib/importer";
import { GROUP_SHORT, type TrainingGroup } from "@/lib/types";
import { shortName } from "@/lib/names";

const MAX_BYTES = 2 * 1024 * 1024; // the template is ~10KB; 2MB is already absurd

export type GoalPreview = {
  row: number;
  name: string;
  email: string;
  /** null = the row set a group but no mileage. */
  goal: number | null;
  /** The goal as written ("55-60", "60+"); null for a plain number. */
  label: string | null;
  /** Name on the matched account, or null when no athlete has that email. */
  matchedName: string | null;
  /** What this file puts them in; null = leave them where they are. */
  group: ParsedGroup;
  /** What they are RIGHT NOW, before this upload. null = no account yet. */
  currentGroup: TrainingGroup | null;
};

/** An athlete this upload moves between squads — the confirm screen's most
 *  important line, because a mistyped GROUP column is otherwise invisible
 *  until someone runs the wrong workout. */
export type GroupMove = { name: string; from: TrainingGroup; to: TrainingGroup };

export type UploadPreview = {
  weekStartISO: string;
  plansDistance: string[]; // 7, Monday-first
  plansMid: string[]; // 7, Monday-first
  goals: GoalPreview[];
  warnings: ImportWarning[];
  /** Who changes squad if this posts. Empty on a normal week. */
  moves: GroupMove[];
  /** Squad sizes after this upload — the coach's sanity check. */
  squadCounts: Record<TrainingGroup, number>;
  /** Athletes with an account who aren't in the file. On a fresh week they get
   *  NO goal (a goal already set for this exact week is left alone). */
  missingFromFile: string[];
  replacesExistingPlan: boolean;
};

export type PreviewResult =
  | { ok: true; preview: UploadPreview }
  | { ok: false; errors: ImportError[] };

export type CommitResult =
  | {
      ok: true;
      weekStartISO: string;
      goalsSet: number;
      /** Emails in the file with no athlete account — their goals were NOT set. */
      skippedEmails: string[];
      movedToMid: number;
      movedToDistance: number;
    }
  | { ok: false; errors: ImportError[] };

async function fileFrom(formData: FormData): Promise<Buffer | ImportError> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { where: "File", message: "No file was uploaded. Pick the filled-in template." };
  }
  if (file.size > MAX_BYTES) {
    return {
      where: "File",
      message: `That file is ${Math.round(file.size / 1024)}KB — too big to be the week plan template.`,
    };
  }
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Step 1: parse the upload and show the coach exactly what will happen —
 * including which emails don't match an account. Reads only; nothing is
 * written until the coach confirms.
 */
export async function previewUpload(formData: FormData): Promise<PreviewResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, errors: [{ where: "Account", message: auth.error }] };
  const { supabase } = auth;

  const buf = await fileFrom(formData);
  if (!Buffer.isBuffer(buf)) return { ok: false, errors: [buf] };

  const parsed = await parseTemplate(buf);
  if (!parsed.ok) return parsed;
  const { weekStartISO, plansDistance, plansMid, goals, warnings } = parsed.data;

  // Match every email against a real athlete account. An unmatched email is
  // shown here and blocks the write — never dropped silently (docs/12 P4).
  // Status filter matches import_week AND the grid: a goal must never land
  // on an account the coach can't see.
  const { data: roster, error: rosterError } = await supabase
    .from("profiles")
    .select("id,name,email,training_group")
    .eq("role", "athlete")
    .in("status", ["active", "injured"])
    .is("deleted_at", null);
  // A failed roster read must not masquerade as "nobody has an account" —
  // that preview would say every goal is unmatched while a confirm would
  // happily set them all.
  if (rosterError) {
    return {
      ok: false,
      errors: [{ where: "Roster", message: "Couldn't read the roster just now — drop the file in again." }],
    };
  }

  type RosterRow = { id: string; name: string; email: string; training_group: TrainingGroup | null };
  const rosterRows = (roster as RosterRow[] | null) ?? [];
  const byEmail = new Map(rosterRows.map((p) => [p.email, p]));
  const inFile = new Set(goals.map((g) => g.email));

  // Who moves squad if this posts, and what the two squads look like
  // afterwards. Computed here rather than in the browser so the confirm
  // screen and the write agree on the same roster snapshot.
  const moves: GroupMove[] = [];
  const after = new Map<string, TrainingGroup>(
    rosterRows.map((p) => [p.email, (p.training_group ?? "distance") as TrainingGroup]),
  );
  for (const g of goals) {
    const person = byEmail.get(g.email);
    if (!person || !g.group) continue;
    const current = (person.training_group ?? "distance") as TrainingGroup;
    if (current === g.group) continue;
    after.set(g.email, g.group);
    moves.push({
      name: shortName({ name: person.name, email: person.email }),
      from: current,
      to: g.group,
    });
  }
  moves.sort((a, b) => a.name.localeCompare(b.name));
  const squadCounts: Record<TrainingGroup, number> = { distance: 0, mid: 0 };
  for (const grp of after.values()) squadCounts[grp] += 1;

  // The parser flags a mid-D roster with an empty mid-D column, but it can
  // only see this file. Athletes already marked mid-D in the database and
  // absent from the upload are invisible to it — and they are exactly the
  // guys who would open the app to a blank week.
  if (squadCounts.mid > 0 && plansMid.every((t) => !t.trim())) {
    warnings.push({
      where: "Week Plan!D6:D12",
      message: `${squadCounts.mid} ${squadCounts.mid === 1 ? "athlete is" : "athletes are"} on the mid-distance schedule, but the mid-distance column is empty — they'll see no workouts this week.`,
    });
  }

  const { data: existingPlan } = await supabase
    .from("week_plans")
    .select("id")
    .eq("week_start", weekStartISO)
    .is("deleted_at", null)
    .limit(1);

  return {
    ok: true,
    preview: {
      weekStartISO,
      plansDistance,
      plansMid,
      goals: goals.map((g) => {
        const person = byEmail.get(g.email);
        return {
          ...g,
          matchedName: person?.name ?? null,
          currentGroup: person ? ((person.training_group ?? "distance") as TrainingGroup) : null,
        };
      }),
      warnings,
      moves,
      squadCounts,
      missingFromFile: [...byEmail.keys()].filter((e) => !inFile.has(e)).sort(),
      replacesExistingPlan: (existingPlan?.length ?? 0) > 0,
    },
  };
}

/**
 * Step 2: write it. Re-parses the same file server-side rather than trusting
 * a payload from the browser, then hands the whole import to `import_week`
 * (migration 0002) so plans and goals land in one transaction or not at all.
 *
 * Emails with no matching athlete account are filtered out HERE, not sent to
 * import_week (which would refuse the entire week — workouts included, which
 * during onboarding is most weeks). Not a silent drop: the preview showed
 * each one as "no account", and the result names them again.
 */
export async function commitUpload(formData: FormData): Promise<CommitResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, errors: [{ where: "Account", message: auth.error }] };
  const { supabase } = auth;

  const buf = await fileFrom(formData);
  if (!Buffer.isBuffer(buf)) return { ok: false, errors: [buf] };

  const parsed = await parseTemplate(buf);
  if (!parsed.ok) return parsed;
  const { weekStartISO, plansDistance, plansMid, goals } = parsed.data;

  // Same roster scope as the preview and import_week: a goal must never
  // land on an account the coach can't see.
  const { data: roster, error: rosterError } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "athlete")
    .in("status", ["active", "injured"])
    .is("deleted_at", null);
  if (rosterError) {
    return { ok: false, errors: [{ where: "Import", message: "Nothing was saved. Couldn't read the roster — try again." }] };
  }
  const rosterEmails = new Set(
    ((roster as { email: string }[] | null) ?? []).map((p) => p.email),
  );
  const matched = goals.filter((g) => rosterEmails.has(g.email));
  const skippedEmails = goals.filter((g) => !rosterEmails.has(g.email)).map((g) => g.email);

  const { data, error } = await supabase.rpc("import_week", {
    p_week_start: weekStartISO,
    p_plans_distance: plansDistance,
    p_plans_mid: plansMid,
    p_goals: matched.map((g) => ({
      email: g.email,
      goal: g.goal,
      label: g.label,
      group: g.group,
    })),
  });

  if (error) {
    // Postgres raised — nothing persisted. Its message is already written for
    // a human ("No athlete account for: x@y"), so pass it through rather than
    // flattening every failure into "something went wrong".
    //
    // The one case worth translating: migration 0011 hasn't been pasted, so
    // the four-argument import_week doesn't exist yet. PostgREST reports that
    // as a schema-cache miss, which tells a coach nothing.
    const missingFn =
      /could not find the function|does not exist|PGRST202/i.test(
        `${error.message} ${error.code ?? ""}`,
      ) && /import_week/i.test(error.message);
    return {
      ok: false,
      errors: [
        {
          where: "Import",
          message: missingFn
            ? "Nothing was saved. The mid-distance update hasn't been applied to the database yet — migration 0011 still needs to be run. Tell William; it's a two-minute fix."
            : /no athlete account for/i.test(error.message)
              ? `${error.message}. Nothing was saved — check the emails in the Goals tab against the athletes who have signed up, then upload again.`
              : `Nothing was saved. ${error.message}`,
        },
      ],
    };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const goalsSet = row?.goals_set ?? 0;
  const movedToMid = row?.moved_to_mid?.length ?? 0;
  const movedToDistance = row?.moved_to_distance?.length ?? 0;

  revalidatePath("/coach");
  revalidatePath("/log");
  return { ok: true, weekStartISO, goalsSet, skippedEmails, movedToMid, movedToDistance };
}
