"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach-auth";
import { parseTemplate, type ImportError, type ImportWarning } from "@/lib/importer";

const MAX_BYTES = 2 * 1024 * 1024; // the template is ~10KB; 2MB is already absurd

export type GoalPreview = {
  row: number;
  name: string;
  email: string;
  goal: number;
  /** Name on the matched account, or null when no athlete has that email. */
  matchedName: string | null;
};

export type UploadPreview = {
  weekStartISO: string;
  plans: string[]; // 7, Monday-first
  goals: GoalPreview[];
  warnings: ImportWarning[];
  /** Athletes with an account who aren't in the file — they keep any goal they already had. */
  missingFromFile: string[];
  replacesExistingPlan: boolean;
};

export type PreviewResult =
  | { ok: true; preview: UploadPreview }
  | { ok: false; errors: ImportError[] };

export type CommitResult =
  | { ok: true; weekStartISO: string; goalsSet: number }
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
  const { weekStartISO, plans, goals, warnings } = parsed.data;

  // Match every email against a real athlete account. An unmatched email is
  // shown here and blocks the write — never dropped silently (docs/12 P4).
  // Status filter matches import_week v2 AND the grid: a goal must never land
  // on an account the coach can't see.
  const { data: roster } = await supabase
    .from("profiles")
    .select("name,email")
    .eq("role", "athlete")
    .in("status", ["active", "injured"])
    .is("deleted_at", null);

  const byEmail = new Map(
    ((roster as { name: string; email: string }[] | null) ?? []).map((p) => [p.email, p.name]),
  );
  const inFile = new Set(goals.map((g) => g.email));

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
      plans,
      goals: goals.map((g) => ({ ...g, matchedName: byEmail.get(g.email) ?? null })),
      warnings,
      missingFromFile: [...byEmail.keys()].filter((e) => !inFile.has(e)).sort(),
      replacesExistingPlan: (existingPlan?.length ?? 0) > 0,
    },
  };
}

/**
 * Step 2: write it. Re-parses the same file server-side rather than trusting
 * a payload from the browser, then hands the whole import to `import_week`
 * (migration 0002) so plans and goals land in one transaction or not at all.
 */
export async function commitUpload(formData: FormData): Promise<CommitResult> {
  const auth = await requireCoach();
  if (!auth.ok) return { ok: false, errors: [{ where: "Account", message: auth.error }] };
  const { supabase } = auth;

  const buf = await fileFrom(formData);
  if (!Buffer.isBuffer(buf)) return { ok: false, errors: [buf] };

  const parsed = await parseTemplate(buf);
  if (!parsed.ok) return parsed;
  const { weekStartISO, plans, goals } = parsed.data;

  const { data, error } = await supabase.rpc("import_week", {
    p_week_start: weekStartISO,
    p_plans: plans,
    p_goals: goals.map((g) => ({ email: g.email, goal: g.goal })),
  });

  if (error) {
    // Postgres raised — nothing persisted. Its message is already written for
    // a human ("No athlete account for: x@y"), so pass it through rather than
    // flattening every failure into "something went wrong".
    return {
      ok: false,
      errors: [
        {
          where: "Import",
          message: /no athlete account for/i.test(error.message)
            ? `${error.message}. Nothing was saved — check the emails in the Goals tab against the athletes who have signed up, then upload again.`
            : `Nothing was saved. ${error.message}`,
        },
      ],
    };
  }

  const goalsSet = Array.isArray(data) ? (data[0]?.goals_set ?? 0) : 0;

  revalidatePath("/coach");
  revalidatePath("/log");
  return { ok: true, weekStartISO, goalsSet };
}
