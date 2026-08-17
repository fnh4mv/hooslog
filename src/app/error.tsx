"use client";

/**
 * Root error boundary: anything that throws during render or a failed server
 * component fetch lands here instead of Next's unbranded production screen.
 * Athletes are on phones at practice — give them one obvious way out.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-2xl font-extrabold tracking-tight text-navy">
        Hoos<span className="text-orange">Log</span>
      </div>
      <p className="text-[15px] font-bold text-ink">Something went sideways.</p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        Your saved runs are safe. Give it another try — if it keeps happening,
        tell Will.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-navy px-6 py-3 text-[15px] font-bold text-white shadow-md"
      >
        Try again
      </button>
    </main>
  );
}
