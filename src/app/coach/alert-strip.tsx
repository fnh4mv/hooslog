import Link from "next/link";
import { fmtDayShort, fromISO } from "@/lib/dates";
import type { Alert } from "@/lib/queries";

/**
 * The pinned strip (locked 15): every pain flag and question in the week, most
 * recent first, each linking to the athlete it came from. This is the whole
 * point of the product — on paper these sat unseen for five days — so it is
 * always rendered, including the quiet state.
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
          ✓ No pain flags or questions this week.
        </div>
      </div>
    );
  }

  const pain = alerts.filter((a) => a.kind === "pain");
  const questions = alerts.filter((a) => a.kind === "question");
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  return (
    <div className="border-b border-[#F0D9BE] bg-orange-soft">
      <div className="mx-auto max-w-[1280px] px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-relaxed text-ink">
          <span aria-hidden className="font-bold text-orange">
            ⚡
          </span>
          <span className="font-bold">
            {pain.length > 0 && (
              <span className="text-orange">{count(pain.length, "pain flag", "pain flags")}</span>
            )}
            {pain.length > 0 && questions.length > 0 && <span className="text-ink-2"> · </span>}
            {questions.length > 0 && (
              <span className="text-orange">{count(questions.length, "question", "questions")}</span>
            )}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {alerts.map((a, i) => {
              const day = fromISO(a.dateISO);
              const isToday = a.dateISO === todayISO;
              return (
                <Link
                  key={`${a.athleteId}-${a.dateISO}-${a.kind}-${i}`}
                  href={`/coach/${a.athleteId}?week=${weekISO}`}
                  className="group inline-flex items-baseline gap-1.5 hover:underline"
                >
                  <span className="font-bold text-navy">{a.athleteName}</span>
                  <span className="text-ink-2">
                    ({a.kind === "pain" ? a.detail : "question"})
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      isToday ? "text-orange" : "text-muted"
                    }`}
                  >
                    {isToday ? "today" : day ? fmtDayShort(day) : a.dateISO}
                  </span>
                </Link>
              );
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
