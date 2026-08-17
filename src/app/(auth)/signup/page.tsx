"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, Field, SubmitButton } from "../ui";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password: String(form.get("password")),
      options: { data: { name: String(form.get("name")).trim() } },
    });
    if (error) {
      // The DB trigger rejects non-UVA, non-staff emails — but GoTrue wraps
      // trigger exceptions as "Database error saving new user", so match that
      // too or the friendly message never reaches anyone.
      setError(
        error.message.includes("UVA") ||
          /database error saving new user/i.test(error.message)
          ? "Signups are restricted to UVA email addresses."
          : error.message,
      );
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" name="name" type="text" autoComplete="name" required />
        <Field label="UVA email" name="email" type="email" autoComplete="email"
          placeholder="abc1de@virginia.edu" required />
        <Field label="Password" name="password" type="password"
          autoComplete="new-password" minLength={8} required />
        {error && <p className="text-sm font-semibold text-orange">{error}</p>}
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-ink-2">
        Already set up?{" "}
        <Link href="/login" className="font-bold text-orange">Sign in</Link>
      </p>
    </AuthShell>
  );
}
