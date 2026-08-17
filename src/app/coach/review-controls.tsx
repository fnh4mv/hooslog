"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDayReview, saveWeekReview } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-line bg-white px-3 py-2 text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-orange";

/**
 * One day's red pen: check it off, leave a comment, or both. Saves on the
 * button, not on every keystroke — the coach is grading 24 of these in a row
 * and a save-per-character would be 24 × a few hundred writes.
 */
export function DayReviewControls({
  athleteId,
  dateISO,
  initialChecked,
  initialComment,
}: {
  athleteId: string;
  dateISO: string;
  initialChecked: boolean;
  initialComment: string | null;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initialChecked);
  const [comment, setComment] = useState(initialComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  const dirty = checked !== initialChecked || comment !== (initialComment ?? "");

  function save(nextChecked = checked) {
    setError(null);
    startTransition(async () => {
      const res = await saveDayReview(athleteId, dateISO, nextChecked, comment);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
      <button
        type="button"
        aria-pressed={checked}
        disabled={busy}
        onClick={() => {
          const next = !checked;
          setChecked(next);
          save(next); // the check alone is a complete review — save immediately
        }}
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border-[1.5px] text-sm font-extrabold transition-colors disabled:opacity-60 ${
          checked
            ? "border-green bg-green-soft text-green"
            : "border-line bg-white text-muted hover:border-green hover:text-green"
        }`}
        title={checked ? "Checked off — click to undo" : "Check this day off"}
      >
        ✓
      </button>

      <div className="min-w-[200px] flex-1">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          placeholder="Comment for this day…"
          className={INPUT}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) save();
          }}
        />
        {error && <p className="mt-1 text-[13px] font-semibold text-orange">{error}</p>}
      </div>

      <button
        type="button"
        onClick={() => save()}
        disabled={busy || !dirty}
        className="h-9 flex-none rounded-xl bg-navy px-4 text-[13px] font-bold text-white disabled:opacity-40"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}

/**
 * Week-level: the coach's comment on the whole week plus the reviewed stamp
 * (locked 16). "Mark reviewed" saves the comment in the same write, so the
 * coach never loses a typed comment by clicking the wrong button first.
 */
export function WeekReviewControls({
  athleteId,
  weekISO,
  initialComment,
  initialReviewed,
}: {
  athleteId: string;
  weekISO: string;
  initialComment: string | null;
  initialReviewed: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState(initialComment ?? "");
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  function save(nextReviewed = reviewed) {
    setError(null);
    startTransition(async () => {
      const res = await saveWeekReview(athleteId, weekISO, comment, nextReviewed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReviewed(nextReviewed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Your comment on the week
        </span>
        {reviewed && <span className="text-[11px] font-extrabold text-green">✓ Reviewed</span>}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What you'd write at the bottom of the sheet…"
        className={`${INPUT} mt-2 resize-none leading-relaxed`}
      />
      {error && <p className="mt-2 text-[13px] font-semibold text-orange">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save()}
          disabled={busy}
          className="flex-1 rounded-xl border-[1.5px] border-line bg-white py-2.5 text-[13px] font-bold text-navy disabled:opacity-60"
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save comment"}
        </button>
        <button
          type="button"
          onClick={() => save(!reviewed)}
          disabled={busy}
          className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-60 ${
            reviewed
              ? "border-[1.5px] border-line bg-white text-ink-2"
              : "bg-navy text-white shadow-md"
          }`}
        >
          {reviewed ? "Undo reviewed" : "Mark week reviewed"}
        </button>
      </div>
    </section>
  );
}
