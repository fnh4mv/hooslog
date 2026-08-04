import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Coach-only gate: role check on the server, on every coach route. */
export default async function CoachLayout({ children }: LayoutProps<"/coach">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") redirect("/log");

  return <>{children}</>;
}
