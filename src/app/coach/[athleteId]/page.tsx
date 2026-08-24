import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCoachAthleteWeek } from "@/lib/queries";
import { addDays, fmtDayShort, fromISO, isoDate, mondayOf, trainingTodayET } from "@/lib/dates";
import { shortName } from "@/lib/names";
import { KIND_LABELS, RUN_TYPE_LABELS, type Log } from "@/lib/types";
import { CoachHeader } from "../header";
import { DayReviewControls, WeekReviewControls } from "../review-controls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One entry inside a day card — a run, or an off/cross-train day. */
function LogLine({ log }: { log: Log }) {
  // Off / cross-train: no mileage line, just what the day was (+ any notes).
  // A cross-train shows its slot — an evening bike after a morning run reads
  // as the double it was. Off days are whole-day, so no slot chip.
  if (log.kind === "off" || log.kind === "cross") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {log.kind === "cross" && (
          <span className="rounded bg-navy-soft px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-navy">
            {log.slot}
          </span>
        )}
        <span className="rounded bg-navy-soft px-2 py-0.5 text-[11px] font-extrabold text-navy">
          {KIND_LABELS[log.kind]}
        </span>
        {log.notes && (
          <span className="text-[13px] font-semibold text-ink-2">{log.notes}</span>
        )}
      </div>
    );
  }

  const bits = [
    log.pace ? `${log.pace} pace` : null,
    log.rpe !== null ? `RPE ${log.rpe}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="rounded bg-navy-soft px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-navy">
        {log.slot}
      </span>
      <span className="text-[15px] font-extrabold text-navy">
        {Number(log.distance_mi)}
        <span className="ml-0.5 text-[11px] font-bold text-muted">mi</span>
      </span>
      {log.run_type && (
        <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
          {RUN_TYPE_LABELS[log.run_type]}
        </span>
      )}
      {bits.length > 0 && (
        <span className="text-[13px] font-semibold text-ink-2">{bits.join(" · ")}</span>
      )}
      {log.notes && (
        <span className="w-full text-[13px] leading-snug text-ink-2">{log.notes}</span>
      )}
    </div>
  );
}

/**
 * Coach drill-in: one athlete's full week, with the red pen on every day and
 * prev/next athlete nav so Sunday grading is one continuous pass. No scores,
 * no response-time metrics anywhere (locked 7, 16).
 */
export default async function AthleteDrillIn({
  params,
  searchParams,
}: PageProps<"/coach/[athleteId]">) {
  const { athleteId } = await params;
  const sp = await searchParams;
  if (!UUID.test(athleteId)) notFound();

  const supabase = await createClient();
  // Which coach is looking? Splits the week comments into "yours" (editable)
  // and the other coach's (read-only). The layout already gated the role.
  const { data: { user } } = await supabase.auth.getUser();
  const coachId = user?.id ?? "";
  const today = trainingTodayET(); // same 3 AM rollover as the grid
  const todayISO = isoDate(today);
  const currentMonday = mondayOf(today);
  const weekParam = typeof sp.week === "string" ? fromISO(sp.week) : null;
  const weekStart = weekParam ? mondayOf(weekParam) : currentMonday;
  const weekISO = isoDate(weekStart);
  const isCurrentWeek = weekISO === isoDate(currentMonday);

  const {
    profile,
    athleteWeek,
    plans,
    logs,
    reviews,
    weekComments,
    dayComments,
    prevAthleteId,
    nextAthleteId,
    position,
  } = await getCoachAthleteWeek(supabase, athleteId, weekISO).catch(() => notFound());

  const myComment = weekComments.find((c) => c.coach_id === coachId)?.comment ?? null;
  const peerComments = weekComments
    .filter((c) => c.coach_id !== coachId)
    .map((c) => ({ coachName: c.coach_name, comment: c.comment }));

  // A coach landing on a coach's id (or a deactivated athlete) gets the roster
  // back rather than an empty week they can't act on.
  if (profile.role !== "athlete") notFound();

  const totalMiles =
    Math.round(logs.reduce((sum, l) => sum + Number(l.distance_mi), 0) * 10) / 10;
  const goal = athleteWeek?.mileage_goal == null ? null : Number(athleteWeek.mileage_goal);
  const goalLabel = athleteWeek?.goal_label ?? null; // "55-60" as written (0010)
  // Uncapped (the bar clamps): 112% is exactly what the coach needs to see.
  const pct = goal && goal > 0 ? Math.round((totalMiles / goal) * 100) : 0;
  const daysLogged = new Set(logs.map((l) => l.log_date)).size;

  const athleteHref = (id: string) => `/coach/${id}?week=${weekISO}`;
  const navBtn =
    "rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-bold text-navy disabled:opacity-40";

  return (
    <div className="min-h-screen">
      <CoachHeader
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        hrefForWeek={(w) => (w ? `/coach/${athleteId}?week=${w}` : `/coach/${athleteId}`)}
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
        {/* ---- who, and how to get to the next one ---- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/coach?week=${weekISO}`} className="text-[12px] font-bold text-orange hover:underline">
              ‹ All athletes
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy">
              {shortName(profile)}
              {profile.status === "injured" && (
                <span className="ml-2 rounded px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wider text-orange ring-1 ring-orange/40">
                  injured
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {prevAthleteId ? (
              <Link href={athleteHref(prevAthleteId)} className={navBtn}>
                ‹ Prev
              </Link>
            ) : (
              <span className={`${navBtn} opacity-40`}>‹ Prev</span>
            )}
            {position.index >= 0 && (
              <span className="text-[12px] font-semibold text-muted">
                {position.index + 1} of {position.total}
              </span>
            )}
            {nextAthleteId ? (
              <Link href={athleteHref(nextAthleteId)} className={navBtn}>
                Next ›
              </Link>
            ) : (
              <span className={`${navBtn} opacity-40`}>Next ›</span>
            )}
          </div>
        </div>

        {/* ---- week totals ---- */}
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[21px] font-extrabold text-navy">
              {totalMiles}
              <span className="ml-1 text-xs font-bold text-muted">
                {goal !== null ? `of ${goalLabel ?? goal} mi` : "mi"}
              </span>
            </div>
            <div className="text-xs font-bold text-ink-2">
              {goal !== null ? `${pct}%` : "No goal set"} · {daysLogged} of 7 days logged
            </div>
          </div>
          {goal !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-soft">
              <div
                className="h-full rounded-full bg-navy"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          )}
        </section>

        {/* ---- the seven days ---- */}
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const dISO = isoDate(d);
          const isToday = dISO === todayISO;
          const isFuture = dISO > todayISO;
          const planText = plans.find((p) => p.day === i)?.plan_text.trim() ?? "";
          const dayLogs = logs.filter((l) => l.log_date === dISO);
          const review = reviews.find((r) => r.log_date === dISO) ?? null;
          const dcs = dayComments.filter((c) => c.log_date === dISO);
          const myDayComment = dcs.find((c) => c.coach_id === coachId)?.comment ?? null;
          const peerDayComments = dcs
            .filter((c) => c.coach_id !== coachId)
            .map((c) => ({ coachName: c.coach_name, comment: c.comment }));
          const painLogs = dayLogs.filter((l) => l.pain_flag);
          const questions = dayLogs.map((l) => l.question?.trim()).filter(Boolean) as string[];

          return (
            <section
              key={dISO}
              className={`rounded-2xl border bg-white p-4 ${
                painLogs.length > 0 ? "border-orange" : "border-line"
              } ${isToday ? "ring-2 ring-orange/30" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-extrabold text-navy">
                  {fmtDayShort(d)}
                  {isToday && (
                    <span className="ml-2 text-[10px] font-extrabold uppercase tracking-wider text-orange">
                      today
                    </span>
                  )}
                </span>
                <span className="text-right text-[12px] font-semibold text-ink-2">
                  {planText || <span className="text-muted">No plan posted</span>}
                </span>
              </div>

              {/* pain + questions first: they're why this page exists */}
              {painLogs.map((l) => (
                <div
                  key={`pain-${l.id}`}
                  className="mt-2.5 rounded-xl border-l-4 border-l-orange bg-orange-soft p-2.5"
                >
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-ink">
                    ⚡ Pain flag {l.slot === "PM" ? "(PM run)" : ""}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink">
                    {l.pain_note?.trim() || "No detail given."}
                  </p>
                </div>
              ))}
              {questions.map((q, qi) => (
                <div
                  key={`q-${qi}`}
                  className="mt-2.5 rounded-xl border-l-4 border-l-navy bg-navy-soft p-2.5"
                >
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-navy">
                    ? Question for you
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink">{q}</p>
                </div>
              ))}

              <div className="mt-2.5 flex flex-col gap-2">
                {dayLogs.length > 0 ? (
                  dayLogs.map((l) => <LogLine key={l.id} log={l} />)
                ) : (
                  <span className="text-[13px] font-semibold text-muted">
                    {isFuture ? "Upcoming" : isToday ? "Nothing logged yet today" : "Not logged"}
                  </span>
                )}
              </div>

              {!isFuture && (
                <DayReviewControls
                  // Keyed by athlete+day ONLY — never by updated_at. The save
                  // path calls router.refresh(); a key that changes with the
                  // row would remount mid-typing and wipe the coach's text.
                  key={`${athleteId}-${dISO}`}
                  athleteId={athleteId}
                  dateISO={dISO}
                  initialChecked={review?.checked ?? false}
                  initialComment={myDayComment}
                  peerComments={peerDayComments}
                />
              )}
            </section>
          );
        })}

        {/* ---- the athlete's own summary, read-only to the coach ---- */}
        {athleteWeek?.athlete_summary?.trim() && (
          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {profile.name.trim().split(" ")[0] || "Athlete"}&apos;s summary of the week
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
              {athleteWeek.athlete_summary}
            </p>
          </section>
        )}

        <WeekReviewControls
          key={`week-${athleteId}-${weekISO}`}
          athleteId={athleteId}
          weekISO={weekISO}
          initialComment={myComment}
          peerComments={peerComments}
          initialReviewed={Boolean(athleteWeek?.reviewed_at)}
        />

        {nextAthleteId && (
          <Link
            href={athleteHref(nextAthleteId)}
            className="rounded-xl border border-line bg-white py-3 text-center text-[13px] font-bold text-navy"
          >
            Next athlete ›
          </Link>
        )}
      </main>
    </div>
  );
}
