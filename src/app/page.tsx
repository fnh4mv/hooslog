import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Role-based front door: athletes → /log, coaches → /coach. */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile?.role === "coach" ? "/coach" : "/log");
}
