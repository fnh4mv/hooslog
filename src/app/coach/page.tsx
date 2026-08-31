import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCoachWeek, type GridCell, type GridRow } from "@/lib/queries";
import { addDays, fromISO, isoDate, mondayOf, trainingTodayET } from "@/lib/dates";
import { shortName } from "@/lib/names";
import { GROUP_LABELS, RUN_TYPE_LABELS, RUN_TYPE_MARKS } from "@/lib/types";
import { AlertStrip } from "./alert-strip";
import { CoachHeader } from "./header";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Grid cell (docs/mockups/09a): miles, or the reason there aren't any. */
function Cell({ cell, state }: { cell: GridCell; state: "past" | "today" | "future" }) {
  const painClass = cell.painFlag
    ? "text-orange underline decoration-orange decoration-2 underline-offset-4"
    : "";
  const question = cell.hasQuestion && (
    <sup className="ml-0.5 font-extrabold text-orange" title="Question for you">
      ?
    </sup>
  );

  // Off / cross-train: reported, but no mileage.
  if (cell.kind === "off" || cell.kind === "cross") {
    return (
      <span className={`text-[12px] font-bold ${painClass || "text-muted"}`}>
        {cell.kind === "off" ? "off" : "XT"}
        {question}
      </span>
    );
  }

  // Nothing logged: "—" = day passed empty, "am" = today still early, blank = future.
  if (cell.miles === null) {
    const mark = state === "past" ? "—" : state === "today" ? "am" : "";
    return <span className="text-[13px] font-semibold text-muted">{mark}</span>;
  }

  const runMark = cell.runType ? RUN_TYPE_MARKS[cell.runType] : "";
  return (
    <span className={`text-[13px] font-bold ${painClass || "text-ink"}`}>
      {cell.miles}
      {runMark && (
        <sup
          className="ml-0.5 font-extrabold text-navy"
          title={cell.runType ? RUN_TYPE_LABELS[cell.runType] : undefined}
        >
          {runMark}
        </sup>
      )}
      {cell.crossToo && (
        <span className="ml-0.5 text-[10px] font-bold text-muted" title="Also cross-trained">
          +XT
        </span>
      )}
      {question}
    </span>
  );
}


/** One athlete's row. Lifted out of the grid so the two squad sections can
 *  each render their own roster without duplicating 60 lines of JSX. */
function AthleteRow({
  row,
  weekISO,
  dayState,
}: {
  row: GridRow;
  weekISO: string;
  dayState: (i: number) => "past" | "today" | "future";
}) {
  // Uncapped — over-goal mileage is a signal, not a rounding artifact.
  // The bar itself clamps at 100.
  const pct =
    row.mileageGoal && row.mileageGoal > 0
      ? Math.round((row.totalMiles / row.mileageGoal) * 100)
      : 0;
  return (
<tr
      key={row.athlete.id}
      className="group border-b border-line bg-white last:border-0 odd:bg-[#FBFCFD] hover:bg-navy-soft"
    >
      {/* Explicit background, never bg-inherit: the <tr> has no
          opaque background of its own, so an inheriting sticky
          cell is transparent and the mileage scrolls visibly
          under the names. group-hover keeps it in step. */}
      <td className="sticky left-0 z-20 bg-white px-4 py-2 group-odd:bg-[#FBFCFD] group-hover:bg-navy-soft">
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
          {row.mileageGoal !== null
            ? ` / ${row.goalLabel ?? row.mileageGoal}`
            : " mi"}
        </span>
      </td>
      {/* Bar is always navy. It used to turn orange when under
          40% of the goal, which painted the whole roster orange
          every Monday — orange has one meaning in this product,
          and it is pain. Mid-week "behind" was also just wrong:
          it compared week-to-date miles to a full-week goal. */}
      <td className="px-4 py-2">
        {row.mileageGoal !== null && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-navy-soft"
            title={`${pct}% of ${row.goalLabel ?? row.mileageGoal} mi goal`}
          >
            <div
              className="h-full rounded-full bg-navy"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </td>
    </tr>
  );
}

/** Coach portal home — the whole team's week on one screen (locked 15, 21). */
export default async function CoachHome({ searchParams }: PageProps<"/coach">) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Training day, not calendar day: until 3 AM ET the coach still opens on
  // the closing week — athletes are still logging Sunday's runs into it.
  const today = trainingTodayET();
  const todayISO = isoDate(today);
  const currentMonday = mondayOf(today);
  const weekParam = typeof sp.week === "string" ? fromISO(sp.week) : null;
  const weekStart = weekParam ? mondayOf(weekParam) : currentMonday;
  const weekISO = isoDate(weekStart);
  const isCurrentWeek = weekISO === isoDate(currentMonday);

  const { rows, squads, alerts } = await getCoachWeek(supabase, weekISO);
  // Two schedules exist as soon as a second squad has athletes or a plan
  // (locked 26). Until then the grid looks exactly as it always has.
  const showSections = squads.length > 1;

  const dayState = (i: number): "past" | "today" | "future" => {
    const d = isoDate(addDays(weekStart, i));
    return d === todayISO ? "today" : d < todayISO ? "past" : "future";
  };
  const reviewedCount = rows.filter((r) => r.reviewed).length;

  // End-of-week reminder: on the weekend, how many athletes with logged data
  // still need a review. In-app red dot, same as the athlete side.
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  const toReview = rows.filter(
    (r) => !r.reviewed && r.cells.some((c) => c.kind !== null),
  ).length;
  const reviewNudge = isCurrentWeek && isWeekend && toReview > 0
    ? `End of the week — ${toReview} athlete${toReview > 1 ? "s" : ""} still to review.`
    : null;

  return (
    <div className="min-h-screen">
      <CoachHeader
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        hrefForWeek={(w) => (w ? `/coach?week=${w}` : "/coach")}
      />
      <AlertStrip alerts={alerts} weekISO={weekISO} todayISO={todayISO} />

      <main className="mx-auto max-w-[1280px] px-4 py-6">
        {reviewNudge && (
          <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-red/40 bg-red-soft px-4 py-3">
            <span className="relative flex h-2.5 w-2.5 flex-none">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red" />
            </span>
            <span className="text-[13px] font-bold text-ink">{reviewNudge}</span>
          </div>
        )}
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
              {/* Header sticks to the top: at 30 athletes the coach scrolls
                  past row 11, and a grid whose day columns have scrolled away
                  is unreadable. z-30 keeps the corner cell above the sticky
                  name column (z-20). */}
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 top-0 z-30 bg-white px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted">
                    Athlete
                  </th>
                  {DOW.map((d, i) => (
                    <th
                      key={d}
                      className={`sticky top-0 z-20 px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${
                        dayState(i) === "today"
                          ? "bg-orange-soft text-orange"
                          : "bg-white text-muted"
                      }`}
                    >
                      {d}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-white px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted">
                    Week
                  </th>
                  <th className="sticky top-0 z-20 w-[120px] bg-white px-4 py-2.5" />
                </tr>
              </thead>

              {squads.map((squad) => (
                <tbody key={squad.group}>
                  {/* Section header only when there really are two schedules —
                      a program running distance alone should see the grid it
                      has always seen, with no empty second squad. */}
                  {showSections && (
                    <tr className="border-y border-line bg-navy">
                      <td
                        colSpan={10}
                        className="px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white"
                      >
                        {GROUP_LABELS[squad.group]}
                        <span className="ml-2 font-bold text-white/60">
                          {squad.rows.length}{" "}
                          {squad.rows.length === 1 ? "athlete" : "athletes"}
                        </span>
                      </td>
                    </tr>
                  )}

                  {squad.hasPlans && (
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
                          {squad.plans[i]?.trim() || <span className="text-muted">—</span>}
                        </td>
                      ))}
                      <td colSpan={2} />
                    </tr>
                  )}

                  {squad.rows.map((row) => (
                    <AthleteRow
                      key={row.athlete.id}
                      row={row}
                      weekISO={weekISO}
                      dayState={dayState}
                    />
                  ))}

                  {squad.rows.length === 0 && (
                    <tr className="border-b border-line bg-white">
                      <td colSpan={10} className="px-4 py-3 text-[12px] text-muted">
                        Nobody is on the {GROUP_LABELS[squad.group].toLowerCase()} schedule
                        yet — set their group in the Goals tab of the week file.
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[11px] font-semibold text-muted">
          <span>
            <b className="text-ink">8.2</b> = miles logged
          </span>
          <span>
            <b className="text-ink">8.2</b>
            <sup className="font-extrabold text-navy">W</sup>/
            <sup className="font-extrabold text-navy">L</sup>/
            <sup className="font-extrabold text-navy">M</sup> = workout / long / medium long
          </span>
          <span>
            <b className="text-ink">off</b> · <b className="text-ink">XT</b> = off day /
            cross-train
          </span>
          <span>
            <b className="text-ink">8.2 +XT</b> = ran + cross-trained
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
        </div>
      </main>
    </div>
  );
}
