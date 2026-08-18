/** Shown while a server component fetches. Deliberately quiet — a full-page
 *  spinner on every week-nav tap reads as jank; this is a calm placeholder. */
export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <div className="text-2xl font-extrabold tracking-tight text-navy">
        Hoos<span className="text-orange">Log</span>
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-navy-soft">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-navy" />
      </div>
    </main>
  );
}
