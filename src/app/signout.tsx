"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        // If the network drops mid-signout, still leave — middleware bounces
        // any half-alive session back to /login on the next request anyway.
        try {
          await createClient().auth.signOut();
        } catch {}
        router.push("/login");
        router.refresh();
      }}
      className="mt-6 rounded-xl border-[1.5px] border-line bg-white px-4 py-2 text-sm font-bold text-ink-2"
    >
      Sign out
    </button>
  );
}
