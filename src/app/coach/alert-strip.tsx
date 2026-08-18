import Link from "next/link";
import { fmtDayShort, fromISO } from "@/lib/dates";
import type { Alert } from "@/lib/queries";

/** Long pain notes and questions get cut here so 15 alerts can't become a wall. */
const MAX_DETAIL = 60;
/** Above this, the rest collapse behind a count — the strip must never push the grid off-screen. */
const MAX_SHOWN = 6;

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX_DETAIL ? `${t.slice(0, MAX_DETAIL - 1)}…` : t;
}

/**
 * The pinned strip (locked 15): every pain flag and question that needs the
 * coach's eyes, most recent first, each linking to the athlete. This is the
 * whole point of the product — on paper these sat unseen for five days — so it
 * is always rendered, including the quiet state.
 *
 * Alerts can reach back a few days before the displayed week (see
 * getCoachWeek): a flag raised Sunday night must still be visible when the
 * coach opens Monday on the new week.
 */
export function AlertStrip({
  alerts,
  weekISO,
  todayISO,
}: {
  alerts: Alert[];
  weekISO: string;
  todayISO: string;
}) {
  if (alerts.length === 0) {
    return (
      <div className="border-b border-line bg-green-soft">
        <div className="mx-auto max-w-[1280px] px-4 py-2.5 text-[13px] font-semibold text-green">
          ✓ Nothing flagged — no pain reports or questions waiting.
        </div>
      </div>
    );
  }

  const pain = alerts.filter((a) => a.kind === "pain");
  const questions = alerts.filter((a) => a.kind === "question");
  const shown = alerts.slice(0, MAX_SHOWN);
  const hidden = alerts.length - shown.length;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="border-b border-[#F0D9BE] bg-orange-soft">
      <div className="mx-auto max-w-[1280px] px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-relaxed text-ink">
          <span aria-hidden className="font-bold text-orange">
            ⚡
          </span>
          <span className="font-bold">
            {pain.length > 0 && (
              <span className="text-orange-ink">{count(pain.length, "pain flag", "pain flags")}</span>
            )}
            {pain.length > 0 && questions.length > 0 && <span className="text-ink-2"> · </span>}
            {questions.length > 0 && (
              <span className="text-orange-ink">{count(questions.length, "question", "questions")}</span>
            )}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {shown.map((a, i) => {
              const day = fromISO(a.dateISO);
              const isToday = a.dateISO === todayISO;
              return (
                <Link
                  key={`${a.athleteId}-${a.dateISO}-${a.kind}-${i}`}
                  href={`/coach/${a.athleteId}?week=${weekISO}`}
                  title={a.detail}
                  className="inline-flex items-baseline gap-1.5 hover:underline"
                >
                  <span aria-hidden className="text-[11px] font-bold text-orange-ink">
                    {a.kind === "pain" ? "⚡" : "?"}
                  </span>
                  <span className="font-bold text-navy">{a.athleteName}</span>
                  <span className="text-ink-2">{clip(a.detail)}</span>
                  <span
                    className={`text-[11px] font-bold ${isToday ? "text-orange-ink" : "text-muted"}`}
                  >
                    {isToday ? "today" : day ? fmtDayShort(day) : a.dateISO}
                  </span>
                </Link>
              );
            })}
            {hidden > 0 && (
              <span className="text-[12px] font-bold text-ink-2">
                +{hidden} more — open an athlete to see everything
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
