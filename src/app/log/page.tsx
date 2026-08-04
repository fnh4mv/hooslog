import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "../signout";

/** Athlete portal — day form + week strip land here (build order: docs/08 §6). */
export default async function AthleteHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("name").eq("id", user!.id).single();

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-2 text-2xl font-extrabold text-navy">
        Hoos<span className="text-orange">Log</span>
      </div>
      <p className="text-ink-2">
        You&apos;re in{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""} — auth works.
        The day form is next on the build list.
      </p>
      <SignOutButton />
    </main>
  );
}
