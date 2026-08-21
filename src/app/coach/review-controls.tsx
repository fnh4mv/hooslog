"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDayReview, saveWeekComment, saveWeekReviewed } from "./actions";

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

  // revertTo: what `checked` should fall back to if the save fails — set when
  // the ✓ toggle saved optimistically, so a failed write never leaves a green
  // check the database doesn't have.
  function save(nextChecked = checked, revertTo?: boolean) {
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveDayReview>>;
      try {
        res = await saveDayReview(athleteId, dateISO, nextChecked, comment);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your connection and try again." };
      }
      if (!res.ok) {
        setError(res.error);
        if (revertTo !== undefined) setChecked(revertTo);
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
          save(next, checked); // the check alone is a complete review — save now, revert on failure
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
          // Save on blur: the coach grades 24 of these and then clicks
          // "Next athlete" — blur fires before that navigation, so typed
          // feedback can't be lost to a click that leaves the page.
          onBlur={() => {
            if (dirty && !busy) save();
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

/** Another coach's week comment, as shown to the signed-in coach. */
export type PeerComment = { coachName: string; comment: string };

/**
 * Week-level: this coach's OWN comment on the week (every coach has their own
 * — locked 16, extended for two real coaches by 0008) plus the shared
 * reviewed stamp. The other coach's feedback shows read-only above the box,
 * so Sunday grading is informed, never a fight over one textbox.
 */
export function WeekReviewControls({
  athleteId,
  weekISO,
  initialComment,
  peerComments,
  initialReviewed,
}: {
  athleteId: string;
  weekISO: string;
  /** The signed-in coach's own saved comment. */
  initialComment: string | null;
  /** Other coaches' comments on this week, read-only. */
  peerComments: PeerComment[];
  initialReviewed: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState(initialComment ?? "");
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  function saveComment() {
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveWeekComment>>;
      try {
        res = await saveWeekComment(athleteId, weekISO, comment);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your connection and try again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      router.refresh();
    });
  }

  function toggleReviewed() {
    const next = !reviewed;
    setReviewed(next);
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveWeekReviewed>>;
      try {
        res = await saveWeekReviewed(athleteId, weekISO, next);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your connection and try again." };
      }
      if (!res.ok) {
        setError(res.error);
        setReviewed(!next); // revert — never show a stamp the DB doesn't have
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Week comments
        </span>
        {reviewed && <span className="text-[11px] font-extrabold text-green">✓ Reviewed</span>}
      </div>

      {peerComments.map((p, i) => (
        <div key={i} className="mt-2 rounded-xl bg-navy-soft p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-navy">
            {p.coachName}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-ink">{p.comment}</p>
        </div>
      ))}

      <span className="mt-3 block text-xs font-semibold text-ink-2">Your comment</span>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What you'd write at the bottom of the sheet…"
        className={`${INPUT} mt-1 resize-none leading-relaxed`}
        // Same reason as the per-day comment: don't lose it to "Next athlete".
        onBlur={() => {
          if (comment !== (initialComment ?? "") && !busy) saveComment();
        }}
      />
      {error && <p className="mt-2 text-[13px] font-semibold text-orange">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveComment}
          disabled={busy}
          className="flex-1 rounded-xl border-[1.5px] border-line bg-white py-2.5 text-[13px] font-bold text-navy disabled:opacity-60"
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save comment"}
        </button>
        <button
          type="button"
          onClick={toggleReviewed}
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
