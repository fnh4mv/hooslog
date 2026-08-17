import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWeekData } from "@/lib/queries";
import {
  addDays,
  fmtDayShort,
  fmtMonthDay,
  fromISO,
  hourET,
  isoDate,
  mondayOf,
  todayET,
} from "@/lib/dates";
import { SignOutButton } from "../signout";
import { DayForms } from "./day-forms";
import { SummaryCard } from "./summary-card";

const DOW_LETTERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Athlete home: week strip + coach's plan + the day form. Mobile-first. */
export default async function AthleteHome({ searchParams }: PageProps<"/log">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware already bounces signed-out users

  // ---- which week / which day ----
  const today = todayET();
  const todayISO = isoDate(today);
  const currentMonday = mondayOf(today);

  const weekParam = typeof sp.week === "string" ? fromISO(sp.week) : null;
  const weekStart = weekParam ? mondayOf(weekParam) : currentMonday; // snap to Monday
  const weekISO = isoDate(weekStart);
  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = weekISO === isoDate(currentMonday);
  const isFutureWeek = weekISO > isoDate(currentMonday);

  const dayParam = typeof sp.day === "string" ? fromISO(sp.day) : null;
  const selected =
    dayParam && isoDate(mondayOf(dayParam)) === weekISO
      ? dayParam
      : isCurrentWeek
        ? today
        : weekStart;
  const selectedISO = isoDate(selected);
  const isFutureDay = selectedISO > todayISO;

  // ---- data ----
  const { profile, athleteWeek, plans, logs, reviews } = await getWeekData(
    supabase,
    user.id,
    weekISO,
  );

  const firstName = profile.name.trim().split(" ")[0] || "";
  const loggedDates = new Set(logs.map((l) => l.log_date));
  const selectedIdx = Math.round(
    (selected.getTime() - weekStart.getTime()) / 86_400_000,
  );
  const planText = plans.find((p) => p.day === selectedIdx)?.plan_text.trim() ?? "";
  const review = reviews.find((r) => r.log_date === selectedISO) ?? null;
  const amLog = logs.find((l) => l.log_date === selectedISO && l.slot === "AM") ?? null;
  const pmLog = logs.find((l) => l.log_date === selectedISO && l.slot === "PM") ?? null;

  const daysLogged = loggedDates.size;
  const totalMiles =
    Math.round(logs.reduce((sum, l) => sum + Number(l.distance_mi), 0) * 10) / 10;
  const goal = athleteWeek?.mileage_goal ?? null;
  const pct = goal ? Math.min(100, Math.round((totalMiles / Number(goal)) * 100)) : 0;

  // ---- end-of-day / end-of-week reminder (current week only) ----
  // In-app red-dot nudge (locked decision: no push infra for the trial). Only
  // nudges when something's actually owed, and holds the daily reminder until
  // the afternoon so it isn't nagging at 7am.
  const loggedToday = loggedDates.has(todayISO);
  let unloggedSoFar = 0; // past-or-today days this week with nothing logged
  for (let i = 0; i < 7; i++) {
    const dISO = isoDate(addDays(weekStart, i));
    if (dISO <= todayISO && !loggedDates.has(dISO)) unloggedSoFar++;
  }
  let nudge: string | null = null;
  if (isCurrentWeek) {
    if (today.getDay() === 0 && unloggedSoFar > 0) {
      // Sunday — the week closes tonight.
      nudge = `Last day of the week — ${unloggedSoFar} day${unloggedSoFar > 1 ? "s" : ""} still to log before it closes tonight.`;
    } else if (!loggedToday && hourET() >= 15) {
      nudge = "Don't forget to log today's run.";
    }
  }
  const nudgeHref = `/log?week=${weekISO}&day=${todayISO}`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6">
      {/* ---- header ---- */}
      <header className="flex items-center justify-between">
        <div className="text-2xl font-extrabold tracking-tight text-navy">
          Hoos<span className="text-orange">Log</span>
        </div>
        <div className="flex items-center gap-2 [&_button]:mt-0">
          <Link
            href="/log/history"
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-navy"
          >
            History
          </Link>
          {firstName && <span className="text-sm font-bold text-ink-2">{firstName}</span>}
          <SignOutButton />
        </div>
      </header>

      {/* ---- reminder nudge (end of day / end of week) ---- */}
      {nudge && (
        <Link
          href={nudgeHref}
          className="flex items-center gap-2.5 rounded-2xl border border-red/40 bg-red-soft px-4 py-3"
        >
          <span className="relative flex h-2.5 w-2.5 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red" />
          </span>
          <span className="text-[13px] font-bold leading-snug text-ink">{nudge}</span>
        </Link>
      )}

      {/* ---- week nav ---- */}
      <div className="mt-1 flex items-center justify-between">
        <Link
          href={`/log?week=${isoDate(addDays(weekStart, -7))}`}
          aria-label="Previous week"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-lg font-bold text-ink-2"
        >
          ‹
        </Link>
        <div className="text-center">
          <div className="text-sm font-bold text-ink">
            Week of {fmtMonthDay(weekStart)} – {fmtMonthDay(weekEnd)}
          </div>
          {!isCurrentWeek && (
            <Link href="/log" className="text-[11px] font-bold text-orange">
              Back to this week
            </Link>
          )}
        </div>
        <Link
          href={`/log?week=${isoDate(addDays(weekStart, 7))}`}
          aria-label="Next week"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-lg font-bold text-ink-2"
        >
          ›
        </Link>
      </div>

      {/* ---- week strip ---- */}
      <div className="flex gap-1.5">
        {DOW_LETTERS.map((dw, i) => {
          const d = addDays(weekStart, i);
          const dISO = isoDate(d);
          const logged = loggedDates.has(dISO);
          const isToday = dISO === todayISO;
          const isFuture = dISO > todayISO;
          const isSel = dISO === selectedISO;
          return (
            <Link
              key={dISO}
              href={`/log?week=${weekISO}&day=${dISO}`}
              aria-current={isSel ? "date" : undefined}
              className={[
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2",
                isToday ? "border-orange bg-orange" : "border-line bg-white",
                isFuture ? "opacity-50" : "",
                isSel ? "ring-2 ring-navy ring-offset-1 ring-offset-page" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={`text-[10px] font-bold tracking-wider ${
                  isToday ? "text-white/80" : "text-muted"
                }`}
              >
                {dw}
              </span>
              <span
                className={`text-[13px] font-bold ${
                  isToday ? "text-white" : logged ? "text-ink" : "text-ink-2"
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`h-3 text-[9px] font-extrabold leading-3 ${
                  isToday ? "text-white" : "text-green"
                }`}
              >
                {logged ? "✓" : isToday ? "today" : ""}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ---- coach's plan for the selected day ---- */}
      <section className="rounded-2xl border border-line border-l-4 border-l-navy bg-white p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Coach&apos;s plan
          </span>
          <span className="text-[11px] font-bold text-ink-2">{fmtDayShort(selected)}</span>
        </div>
        {planText ? (
          <div className="mt-1.5 text-[15px] font-bold leading-snug text-ink">{planText}</div>
        ) : (
          <div className="mt-1.5 text-sm font-semibold text-muted">No plan posted</div>
        )}
      </section>

      {/* ---- coach's day review, when there is one (locked 14/16) ---- */}
      {review && (review.comment || review.checked) && (
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
            From your coach
          </div>
          <div className="mt-1.5 flex items-start gap-2">
            {review.checked && (
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-green-soft text-[11px] font-extrabold text-green">
                ✓
              </span>
            )}
            {review.comment ? (
              <p className="text-sm leading-snug text-ink">{review.comment}</p>
            ) : (
              <p className="text-sm font-semibold text-green">Checked off</p>
            )}
          </div>
        </section>
      )}

      {/* ---- the log form(s), or an upcoming note for future days ---- */}
      {isFutureDay ? (
        <section className="rounded-2xl border-[1.5px] border-dashed border-[#C9CDD8] bg-white p-5 text-center">
          <div className="text-sm font-bold text-ink-2">Upcoming</div>
          <p className="mt-1 text-[13px] text-muted">
            You can log this run on {fmtDayShort(selected)}.
          </p>
        </section>
      ) : (
        <DayForms key={selectedISO} dateISO={selectedISO} amLog={amLog} pmLog={pmLog} />
      )}

      {/* ---- week summary ---- */}
      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
          This week
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="text-[21px] font-extrabold text-navy">
            {totalMiles}
            <span className="ml-1 text-xs font-bold text-muted">
              {goal !== null ? `of ${Number(goal)} mi` : "mi"}
            </span>
          </div>
          <div className="text-xs font-bold text-ink-2">
            {goal !== null ? `${pct}%` : "No goal set yet"}
          </div>
        </div>
        {goal !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-soft">
            <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-2.5 text-xs font-semibold text-ink-2">
          <b className="text-navy">
            {daysLogged} of 7
          </b>{" "}
          days logged
        </div>
      </section>

      {/* ---- Sunday reflection + coach's weekly comment (locked 16, 19) ---- */}
      {!isFutureWeek && (
        <SummaryCard
          key={`summary-${weekISO}`}
          weekISO={weekISO}
          initialSummary={athleteWeek?.athlete_summary ?? null}
          coachComment={athleteWeek?.coach_comment ?? null}
          reviewed={Boolean(athleteWeek?.reviewed_at)}
        />
      )}
    </main>
  );
}
