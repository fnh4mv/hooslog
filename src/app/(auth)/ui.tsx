/** Shared auth-screen chrome: big touch targets, UVA navy/orange (docs/mockups 06). */

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="mb-6 text-3xl font-extrabold tracking-tight text-navy">
        Hoos<span className="text-orange">Log</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h1 className="mb-5 text-lg font-extrabold text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-2">{label}</span>
      <input
        {...input}
        className="w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-[15px] font-semibold text-ink outline-none focus:border-orange"
      />
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-1 rounded-xl bg-navy py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-60"
    >
      {busy ? "One sec…" : children}
    </button>
  );
}
