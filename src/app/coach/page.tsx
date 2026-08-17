import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCoachWeek, type GridCell } from "@/lib/queries";
import { addDays, fromISO, isoDate, mondayOf, todayET } from "@/lib/dates";
import { shortName } from "@/lib/names";
import { AlertStrip } from "./alert-strip";
import { CoachHeader } from "./header";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Grid cell (docs/mockups/09a): miles, or the reason there aren't any. */
function Cell({ cell, state }: { cell: GridCell; state: "past" | "today" | "future" }) {
  if (cell.miles === null) {
    // "—" = the day passed with nothing logged. "am" = today, still early.
    // Future days stay blank: nothing is owed yet.
    const mark = state === "past" ? "—" : state === "today" ? "am" : "";
    return <span className="text-[13px] font-semibold text-muted">{mark}</span>;
  }
  return (
    <span
      className={`text-[13px] font-bold ${
        cell.painFlag
          ? "text-orange underline decoration-orange decoration-2 underline-offset-4"
          : "text-ink"
      }`}
    >
      {cell.miles}
      {cell.hasQuestion && (
        <sup className="ml-0.5 font-extrabold text-orange" title="Question for you">
          ?
        </sup>
      )}
    </span>
  );
}

/** Coach portal home — the whole team's week on one screen (locked 15, 21). */
export default async function CoachHome({ searchParams }: PageProps<"/coach">) {
  const sp = await searchParams;
  const supabase = await createClient();

  const today = todayET();
  const todayISO = isoDate(today);
  const currentMonday = mondayOf(today);
  const weekParam = typeof sp.week === "string" ? fromISO(sp.week) : null;
  const weekStart = weekParam ? mondayOf(weekParam) : currentMonday;
  const weekISO = isoDate(weekStart);
  const isCurrentWeek = weekISO === isoDate(currentMonday);

  const { rows, alerts, plans } = await getCoachWeek(supabase, weekISO);

  const dayState = (i: number): "past" | "today" | "future" => {
    const d = isoDate(addDays(weekStart, i));
    return d === todayISO ? "today" : d < todayISO ? "past" : "future";
  };
  const planFor = (i: number) => plans.find((p) => p.day === i)?.plan_text.trim() ?? "";
  const anyPlans = plans.some((p) => p.plan_text.trim());
  const reviewedCount = rows.filter((r) => r.reviewed).length;

  return (
    <div className="min-h-screen">
      <CoachHeader
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        hrefForWeek={(w) => (w ? `/coach?week=${w}` : "/coach")}
      />
      <AlertStrip alerts={alerts} weekISO={weekISO} todayISO={todayISO} />

      <main className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-extrabold text-navy">
            Team — {rows.length} {rows.length === 1 ? "athlete" : "athletes"}
          </h1>
          <span className="text-[13px] font-semibold text-muted">
            {rows.length > 0 && `${reviewedCount} of ${rows.length} weeks reviewed · `}
            click any row for the athlete&apos;s full week
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-[#C9CDD8] bg-white p-10 text-center">
            <div className="text-sm font-bold text-ink-2">No athletes yet</div>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
              Athletes appear here as soon as they sign up with their UVA email.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-10 bg-white px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted">
                    Athlete
                  </th>
                  {DOW.map((d, i) => (
                    <th
                      key={d}
                      className={`px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${
                        dayState(i) === "today" ? "bg-orange-soft text-orange" : "text-muted"
                      }`}
                    >
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted">
                    Week
                  </th>
                  <th className="w-[120px] px-4 py-2.5" />
                </tr>
              </thead>

              {/* The coach's plan, once, above the roster — every athlete runs
                  the same week in the trial (schema note on week_plans). */}
              {anyPlans && (
                <tbody>
                  <tr className="border-b border-line bg-navy-soft/60">
                    <td className="sticky left-0 z-10 bg-navy-soft/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-navy">
                      Plan
                    </td>
                    {DOW.map((_, i) => (
                      <td
                        key={i}
                        className={`max-w-[110px] px-2 py-2 text-center text-[11px] font-semibold leading-tight text-ink-2 ${
                          dayState(i) === "today" ? "bg-orange-soft/70" : ""
                        }`}
                      >
                        {planFor(i) || <span className="text-muted">—</span>}
                      </td>
                    ))}
                    <td colSpan={2} />
                  </tr>
                </tbody>
              )}

              <tbody>
                {rows.map((row) => {
                  const pct =
                    row.mileageGoal && row.mileageGoal > 0
                      ? Math.min(100, Math.round((row.totalMiles / row.mileageGoal) * 100))
                      : 0;
                  const behind = row.mileageGoal !== null && pct < 40;
                  return (
                    <tr
                      key={row.athlete.id}
                      className="border-b border-line last:border-0 hover:bg-navy-soft/50"
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-2">
                        <Link
                          href={`/coach/${row.athlete.id}?week=${weekISO}`}
                          className="flex items-baseline gap-2 hover:underline"
                        >
                          <span className="text-[13px] font-bold text-navy">
                            {shortName(row.athlete)}
                          </span>
                          {row.athlete.status === "injured" && (
                            <span className="rounded px-1 py-px text-[9px] font-extrabold uppercase tracking-wider text-orange ring-1 ring-orange/40">
                              inj
                            </span>
                          )}
                          {row.reviewed && (
                            <span className="text-[10px] font-extrabold text-green" title="Week reviewed">
                              ✓
                            </span>
                          )}
                        </Link>
                      </td>

                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          className={`px-2 py-2 text-center ${
                            dayState(i) === "today" ? "bg-orange-soft/70" : ""
                          }`}
                        >
                          <Cell cell={cell} state={dayState(i)} />
                        </td>
                      ))}

                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="text-[13px] font-extrabold text-navy">
                          {row.totalMiles}
                        </span>
                        <span className="text-[11px] font-semibold text-muted">
                          {row.mileageGoal !== null ? ` / ${row.mileageGoal}` : " mi"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {row.mileageGoal !== null && (
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-navy-soft"
                            title={`${pct}% of goal`}
                          >
                            <div
                              className={`h-full rounded-full ${behind ? "bg-orange" : "bg-navy"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[11px] font-semibold text-muted">
          <span>
            <b className="text-ink">8.2</b> = miles logged
          </span>
          <span>
            <b className="text-orange underline decoration-2 underline-offset-4">orange</b> = pain
            flag
          </span>
          <span>
            <b className="text-orange">?</b> = question for you
          </span>
          <span>
            <b className="text-ink">—</b> = not logged
          </span>
          <span>
            <b className="text-ink">am</b> = today, not in yet
          </span>
          <span>blank = upcoming</span>
        </div>
      </main>
    </div>
  );
}
