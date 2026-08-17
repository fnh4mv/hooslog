"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLog, saveLog } from "./actions";
import type { Log, Slot } from "@/lib/types";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-orange";

/**
 * The day's log form(s): AM always, PM revealed by "+ Add PM run" (doubles =
 * two rows, locked 19). Server pre-fills via props; page.tsx keys this by
 * date so switching days resets state.
 */
export function DayForms({
  dateISO,
  amLog,
  pmLog,
}: {
  dateISO: string;
  amLog: Log | null;
  pmLog: Log | null;
}) {
  const [showPM, setShowPM] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <LogForm dateISO={dateISO} slot="AM" existing={amLog} />
      {pmLog || showPM ? (
        <LogForm dateISO={dateISO} slot="PM" existing={pmLog} />
      ) : (
        <button
          type="button"
          onClick={() => setShowPM(true)}
          className="rounded-2xl border-[1.5px] border-dashed border-[#C9CDD8] bg-white py-3.5 text-sm font-bold text-ink-2"
        >
          + Add PM run
        </button>
      )}
    </div>
  );
}

function LogForm({
  dateISO,
  slot,
  existing,
}: {
  dateISO: string;
  slot: Slot;
  existing: Log | null;
}) {
  const router = useRouter();
  const [distance, setDistance] = useState(existing ? String(existing.distance_mi) : "");
  const [pace, setPace] = useState(existing?.pace ?? "");
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [pain, setPain] = useState(existing?.pain_flag ?? false);
  const [painNote, setPainNote] = useState(existing?.pain_note ?? "");
  const [question, setQuestion] = useState(existing?.question ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  function onSave() {
    const dist = Number(distance);
    if (distance.trim() === "" || !Number.isFinite(dist)) {
      setError("Enter your distance in miles.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveLog>>;
      try {
        res = await saveLog({
          log_date: dateISO,
          slot,
          distance_mi: dist,
          pace: pace.trim() || undefined,
          rpe: rpe ?? undefined,
          pain_flag: pain,
          pain_note: painNote.trim() || undefined,
          question: question.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } catch {
        // Flaky phone data at practice is the normal case, not the edge case.
        res = { ok: false, error: "Couldn't reach the server — check your signal and hit Save again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh(); // make the strip's ✓ and the week summary catch up now
    });
  }

  function onDelete() {
    if (!existing) return;
    if (!window.confirm("Remove this run? The day goes back to unlogged.")) return;
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof deleteLog>>;
      try {
        res = await deleteLog(existing.id);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — try again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The form isn't remounted by the refresh (it's keyed by date), so clear
      // it by hand — otherwise the deleted run's numbers linger in the fields.
      setDistance("");
      setPace("");
      setRpe(null);
      setPain(false);
      setPainNote("");
      setQuestion("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          What you ran
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${
            slot === "AM" ? "bg-orange-soft text-orange" : "bg-navy-soft text-navy"
          }`}
        >
          {slot}
        </span>
      </div>

      <div className="flex gap-2.5">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Distance</span>
          <div className="relative">
            <input
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              inputMode="decimal"
              placeholder="7.0"
              required
              className={`${INPUT} pr-9`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted">
              mi
            </span>
          </div>
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-semibold text-ink-2">
            Pace <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            value={pace}
            onChange={(e) => setPace(e.target.value)}
            maxLength={10}
            placeholder="6:45 /mi"
            className={INPUT}
          />
        </label>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-semibold text-ink-2">
          How it felt — effort 1–10 <span className="font-normal text-muted">(optional)</span>
        </span>
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rpe === n}
              onClick={() => setRpe(rpe === n ? null : n)}
              className={`flex-1 rounded-lg border-[1.5px] py-2 text-[13px] font-bold ${
                rpe === n
                  ? "border-orange bg-orange text-white"
                  : "border-line bg-white text-ink-2"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Anything hurting?</span>
          <button
            type="button"
            role="switch"
            aria-checked={pain}
            onClick={() => setPain(!pain)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              pain ? "bg-orange" : "bg-[#D6DAE2]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                pain ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        {pain && (
          <>
            <textarea
              value={painNote}
              onChange={(e) => setPainNote(e.target.value)}
              rows={2}
              placeholder="Where and how much? e.g. left achilles, dull after mile 5"
              className={`${INPUT} mt-2 resize-none leading-relaxed`}
            />
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-soft px-2.5 py-1.5 text-[11px] font-bold text-orange">
              ⚡ Coach sees this today
            </span>
          </>
        )}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold text-ink-2">Question for coach</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Flats or spikes for Saturday?"
          className={INPUT}
        />
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold text-ink-2">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Route, who you ran with, how it felt…"
          className={`${INPUT} resize-none leading-relaxed`}
        />
      </label>

      {error && <p className="mt-3 text-sm font-semibold text-orange">{error}</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-navy py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-60"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : existing ? "Update run" : "Save run"}
      </button>
      <p className="mt-2 text-center text-[11px] font-semibold text-ink-2">
        Every save goes straight to your coach — no submit day.
      </p>
      {existing && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="mt-1 w-full py-1.5 text-center text-[12px] font-semibold text-muted underline-offset-2 hover:text-orange hover:underline disabled:opacity-60"
        >
          Logged the wrong day? Remove this run
        </button>
      )}
    </section>
  );
}
