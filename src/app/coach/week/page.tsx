import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWeekBuilder } from "@/lib/queries";
import { addDays, fromISO, isoDate, mondayOf, postingWeekMonday, todayET } from "@/lib/dates";
import { CoachHeader } from "../header";
import { WeekBuilder } from "./builder";

/**
 * Post a week, in the app (locked 30).
 *
 * This is the coach's first option; the spreadsheet importer stays at
 * /coach/upload as a backup and is linked from inside the builder. Nothing
 * about the data model changes — both doors write through `import_week`, and
 * every week ever posted stays exactly where it is, readable by walking the
 * week nav back.
 */
export default async function WeekBuilderPage({ searchParams }: PageProps<"/coach/week">) {
  const sp = await searchParams;
  const supabase = await createClient();

  // The builder reasons in CALENDAR weeks, not training days. The 3 AM
  // rollover is right for logging — an athlete's 12:40 AM run belongs to
  // yesterday — but a coach opening this screen at 1 AM Monday is posting the
  // week that starts that morning, and "this week" must agree with the default
  // below or the banner contradicts itself across midnight.
  const currentMonday = mondayOf(todayET());
  const weekParam = typeof sp.week === "string" ? fromISO(sp.week) : null;
  // From noon on Sunday the builder opens on the week AHEAD, and stays on it
  // for the rest of that week (William, 2026-09-15). Before then it opens on
  // the week in progress, which is still the one a correction would apply to.
  const defaultMonday = postingWeekMonday();
  // Any date the coach lands on is snapped to its Monday. A week that does not
  // start on a Monday is not expressible here — one of the things the
  // spreadsheet let him type by hand.
  const weekStart = weekParam ? mondayOf(weekParam) : defaultMonday;
  const weekISO = isoDate(weekStart);
  const currentISO = isoDate(currentMonday);
  // Did we move him forward on our own? If so the banner says so, rather than
  // letting a coach wonder why the dates aren't the ones he expected.
  const openedAhead = !weekParam && weekISO !== currentISO;

  const data = await getWeekBuilder(supabase, weekISO);

  return (
    <div className="min-h-screen">
      <CoachHeader
        weekStart={weekStart}
        isCurrentWeek={weekISO === currentISO}
        hrefForWeek={(w) => (w ? `/coach/week?week=${w}` : "/coach/week")}
      />

      <main className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/coach" className="text-[12px] font-bold text-orange hover:underline">
              ‹ All athletes
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy">Post a week</h1>
          </div>
          <Link
            href="/coach/upload"
            className="text-[12px] font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-navy"
          >
            Use the spreadsheet instead
          </Link>
        </div>

        <WeekBuilder
          data={data}
          weekStartISO={weekISO}
          currentMondayISO={currentISO}
          prevWeekISO={isoDate(addDays(weekStart, -7))}
          nextWeekISO={isoDate(addDays(weekStart, 7))}
          openedAhead={openedAhead}
        />
      </main>
    </div>
  );
}
