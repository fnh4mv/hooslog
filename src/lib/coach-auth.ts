import { createClient } from "@/lib/supabase/server";

export type CoachAuth =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; coachId: string };

/**
 * Role check for every coach-side write. RLS already blocks a non-coach, but
 * failing here turns a database rejection into a plain-English message and
 * keeps the check next to the code it protects.
 *
 * Lives in lib/ rather than a "use server" module: everything exported from
 * one of those becomes a callable endpoint, and this is a helper, not an
 * action.
 */
export async function requireCoach(): Promise<CoachAuth> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in and try again." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") {
    return { ok: false, error: "Only coaches can do that." };
  }
  return { ok: true, supabase, coachId: user.id };
}
