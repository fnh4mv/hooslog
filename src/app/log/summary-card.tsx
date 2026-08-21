"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSummary } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-orange";

/**
 * The week's SUMMARY box (locked 19): the athlete's Sunday reflection,
 * editable any day of the week. Also surfaces every coach's weekly comment
 * (locked 16; per-coach since 0008) read-only when present — with two real
 * coaches, each comment is attributed so the athlete knows who said what.
 * page.tsx keys this by week so navigating weeks resets local state.
 */
export function SummaryCard({
  weekISO,
  initialSummary,
  coachComments,
  reviewed,
}: {
  weekISO: string;
  initialSummary: string | null;
  coachComments: { coachName: string; comment: string }[];
  reviewed: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialSummary ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  function onSave() {
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveSummary>>;
      try {
        res = await saveSummary(weekISO, text);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your signal and try again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
        Sunday reflection
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="How the week went — what clicked, what didn't, anything coach should know…"
        className={`${INPUT} mt-2 resize-none leading-relaxed`}
      />
      {error && <p className="mt-2 text-sm font-semibold text-orange">{error}</p>}
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-navy py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : initialSummary ? "Update reflection" : "Save reflection"}
      </button>

      {coachComments.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {coachComments.map((c, i) => (
            <div key={i} className="rounded-xl border-l-4 border-l-orange bg-orange-soft p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange">
                  {c.coachName}
                </span>
                {reviewed && i === 0 && (
                  <span className="text-[11px] font-extrabold text-green">✓ Reviewed</span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-ink">{c.comment}</p>
            </div>
          ))}
        </div>
      ) : reviewed ? (
        <p className="mt-3 text-xs font-semibold text-green">✓ Week reviewed by your coach</p>
      ) : null}
    </section>
  );
}
