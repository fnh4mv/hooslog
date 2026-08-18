import Link from "next/link";

/** 404. Athletes get here from a stale bookmark or a mistyped URL. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-2xl font-extrabold tracking-tight text-navy">
        Hoos<span className="text-orange">Log</span>
      </div>
      <p className="text-[15px] font-bold text-ink">That page doesn&apos;t exist.</p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        Nothing&apos;s wrong with your log — this link just doesn&apos;t go anywhere.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-xl bg-navy px-6 py-3 text-[15px] font-bold text-white shadow-md"
      >
        Back to my week
      </Link>
    </main>
  );
}
