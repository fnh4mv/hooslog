"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, Field, SubmitButton } from "../ui";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim().toLowerCase(),
      password: String(form.get("password")),
    });
    if (error) {
      setError("Wrong email or password.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="UVA email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="text-sm font-semibold text-orange">{error}</p>}
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-ink-2">
        First time here?{" "}
        <Link href="/signup" className="font-bold text-orange">Create your account</Link>
      </p>
    </AuthShell>
  );
}
