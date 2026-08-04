import { SignOutButton } from "../signout";

/** Coach portal — the Option A team grid lands here (docs/mockups/09a). */
export default function CoachHome() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-2 text-2xl font-extrabold text-navy">
        Hoos<span className="text-orange">Log</span>{" "}
        <span className="text-xs font-bold tracking-widest text-muted">COACH</span>
      </div>
      <p className="text-ink-2">
        Coach role confirmed. The team grid, athlete drill-in, plan upload, and
        review flow build here next.
      </p>
      <SignOutButton />
    </main>
  );
}
