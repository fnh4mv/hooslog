import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHistory } from "@/lib/queries";
import { addDays, fmtMonthDay, fromISO, isoDate, mondayOf, trainingTodayET } from "@/lib/dates";

/** "Aug 3 – 9", or "Aug 31 – Sep 6" across a month boundary. */
function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${fmtMonthDay(start)} – ${end.getDate()}`
    : `${fmtMonthDay(start)} – ${fmtMonthDay(end)}`;
}

/**
 * My past weeks, most recent first (History tab — locked 13). Rows link back
 * to /log?week=…, which renders past weeks read-write: backfill is normal,
 * never shamed.
 */
export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware already bounces signed-out users

  // Training day: until 3 AM ET the closing week is still "this week",
  // not history.
  const currentMonday = mondayOf(trainingTodayET());
  const weeks = await getHistory(supabase, user.id, isoDate(currentMonday));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6">
      {/* ---- header ---- */}
      <header className="flex items-center justify-between">
        <div className="text-2xl font-extrabold tracking-tight text-navy">
          Hoos<span className="text-orange">Log</span>
        </div>
        <Link
          href="/log"
          className="rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-bold text-navy"
        >
          This week
        </Link>
      </header>

      <div className="mt-1">
        <h1 className="text-lg font-extrabold text-ink">History</h1>
        <p className="text-[13px] text-muted">
          Your past weeks — tap one to look back or fill in a missed day.
        </p>
      </div>

      {weeks.length === 0 ? (
        <section className="rounded-2xl border-[1.5px] border-dashed border-[#C9CDD8] bg-white p-6 text-center">
          <div className="text-sm font-bold text-ink-2">No past weeks yet</div>
          <p className="mt-1 text-[13px] text-muted">
            Once this week wraps up, it&apos;ll show up here.
          </p>
        </section>
      ) : (
        weeks.map((w) => {
          const start = fromISO(w.weekStart);
          if (!start) return null;
          return (
            <Link
              key={w.weekStart}
              href={`/log?week=${w.weekStart}`}
              className="rounded-2xl border border-line bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Week of {fmtWeekRange(start)}</span>
                {w.reviewed && (
                  <span className="rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-extrabold text-green">
                    ✓ Reviewed
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-[19px] font-extrabold text-navy">
                  {w.totalMiles}
                  <span className="ml-1 text-xs font-bold text-muted">
                    {w.mileageGoal !== null ? `of ${w.mileageGoal} mi` : "mi"}
                  </span>
                </div>
                <span className="text-xs font-semibold text-ink-2">
                  <b className="text-navy">{w.daysLogged} of 7</b> days logged
                </span>
              </div>
            </Link>
          );
        })
      )}
    </main>
  );
}
