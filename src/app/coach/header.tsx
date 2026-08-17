import Link from "next/link";
import { addDays, fmtMonthDay, isoDate } from "@/lib/dates";
import { SignOutButton } from "../signout";

/**
 * The navy coach bar (docs/mockups/09a): wordmark, week nav, sign out.
 * Shared by the grid and the drill-in so week navigation is in the same place
 * on both — `backHref` is what the ‹ › links point at.
 */
export function CoachHeader({
  weekStart,
  hrefForWeek,
  isCurrentWeek,
}: {
  weekStart: Date;
  hrefForWeek: (weekISO: string) => string;
  isCurrentWeek: boolean;
}) {
  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-lg font-bold text-white/90 hover:bg-white/20";

  return (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
        <Link href="/coach" className="text-xl font-extrabold tracking-tight text-white">
          Hoos<span className="text-orange">Log</span>
          <span className="ml-2 text-[11px] font-bold tracking-[0.06em] text-[#B8C0D4]">
            COACH
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={hrefForWeek(isoDate(addDays(weekStart, -7)))}
            aria-label="Previous week"
            className={navBtn}
          >
            ‹
          </Link>
          <span className="min-w-[168px] text-center text-[15px] font-bold text-white">
            Week of {fmtMonthDay(weekStart)} – {fmtMonthDay(addDays(weekStart, 6))}
          </span>
          <Link
            href={hrefForWeek(isoDate(addDays(weekStart, 7)))}
            aria-label="Next week"
            className={navBtn}
          >
            ›
          </Link>
          {!isCurrentWeek && (
            <Link
              href={hrefForWeek("")}
              className="ml-1 text-[11px] font-bold text-orange hover:underline"
            >
              This week
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 [&_button]:mt-0 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white">
          <Link
            href="/coach/upload"
            className="rounded-xl border-[1.5px] border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
          >
            Post a week
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
