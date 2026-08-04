"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="mt-6 rounded-xl border-[1.5px] border-line bg-white px-4 py-2 text-sm font-bold text-ink-2"
    >
      Sign out
    </button>
  );
}
