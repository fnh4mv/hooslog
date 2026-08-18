"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLog, saveLog } from "./actions";
import { RUN_TYPE_LABELS, type Log, type LogKind, type RunType, type Slot } from "@/lib/types";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-orange";

const RUN_TYPES: RunType[] = ["workout", "long", "aerobic"];

/**
 * The day's entry. A day is one of three things (Ran / Off / Cross-train); the
 * mode picker at the top switches between them. "Ran" shows the run form(s) —
 * AM always, PM revealed by "+ Add PM run" (doubles). Off and cross-train are
 * a light card that still carries a pain flag and a question.
 *
 * page.tsx keys this by date, so switching days resets everything.
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
  // The AM slot holds either the morning run OR the off/cross entry.
  const dayKind: LogKind = amLog && amLog.kind !== "run" ? amLog.kind : "run";
  const [mode, setMode] = useState<LogKind>(dayKind);
  const [showPM, setShowPM] = useState(false);

  const nonRun = amLog && amLog.kind !== "run" ? amLog : null;
  const savedRuns = [amLog?.kind === "run" ? amLog : null, pmLog].filter(Boolean) as Log[];
  const savedFlag = savedRuns.some((l) => l.pain_flag || l.question);

  /**
   * Marking a day off/cross replaces the runs saved for it. Warn first — losing
   * a pain flag or a question to a mis-tap is the worst thing this form can do,
   * because the coach may already have acted on it.
   */
  function changeMode(next: LogKind) {
    if (next === mode) return;
    if (next !== "run" && savedRuns.length > 0) {
      const what = savedRuns.length > 1 ? "the runs you logged" : "the run you logged";
      const extra = savedFlag
        ? "\n\nHeads up: that includes something you flagged for your coach."
        : "";
      if (!window.confirm(`Marking this an ${next === "off" ? "off day" : "cross-train day"} removes ${what} for this day.${extra}\n\nContinue?`)) return;
    }
    setMode(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <ModePicker mode={mode} onChange={changeMode} />

      {mode === "run" ? (
        <>
          <LogForm dateISO={dateISO} slot="AM" existing={amLog?.kind === "run" ? amLog : null} />
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
        </>
      ) : (
        <OffDayForm
          dateISO={dateISO}
          kind={mode}
          existing={nonRun}
          replacesRuns={savedRuns.length}
          replacesFlag={savedFlag}
        />
      )}
    </div>
  );
}

/** Ran / Off / Cross-train — the three things a day can be. */
function ModePicker({ mode, onChange }: { mode: LogKind; onChange: (m: LogKind) => void }) {
  const opts: { value: LogKind; label: string }[] = [
    { value: "run", label: "Ran" },
    { value: "off", label: "Off day" },
    { value: "cross", label: "Cross-train" },
  ];
  return (
    <div className="flex gap-1.5 rounded-2xl border border-line bg-white p-1.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${
            mode === o.value ? "bg-navy text-white shadow-sm" : "bg-white text-ink-2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shared: pain toggle + question + notes + save/delete, used by both forms. */
function useDayEntry(existing: Log | null) {
  const router = useRouter();
  const [pain, setPain] = useState(existing?.pain_flag ?? false);
  const [painNote, setPainNote] = useState(existing?.pain_note ?? "");
  const [question, setQuestion] = useState(existing?.question ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, startTransition] = useTransition();
  return {
    router, pain, setPain, painNote, setPainNote, question, setQuestion,
    notes, setNotes, error, setError, saved, setSaved, busy, startTransition,
  };
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
  const s = useDayEntry(existing);
  const [distance, setDistance] = useState(existing ? String(existing.distance_mi) : "");
  const [pace, setPace] = useState(existing?.pace ?? "");
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [runType, setRunType] = useState<RunType | null>(existing?.run_type ?? null);

  function onSave() {
    const blank = distance.trim() === "";
    // Reporting pain or asking a question must never be blocked by a mileage
    // field — that's the whole point of the product. Blank distance is allowed
    // when there's something for the coach; it saves as 0 and still reaches them.
    const reporting = s.pain || s.question.trim() !== "";
    const dist = blank && reporting ? 0 : Number(distance);
    if ((blank && !reporting) || !Number.isFinite(dist)) {
      s.setError(
        blank
          ? "Enter your distance — or flag pain / ask a question and save without it."
          : "That distance isn't a number.",
      );
      return;
    }
    s.setError(null);
    s.startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveLog>>;
      try {
        res = await saveLog({
          log_date: dateISO,
          slot,
          kind: "run",
          run_type: runType,
          distance_mi: dist,
          pace: pace.trim() || undefined,
          rpe: rpe ?? undefined,
          pain_flag: s.pain,
          pain_note: s.painNote.trim() || undefined,
          question: s.question.trim() || undefined,
          notes: s.notes.trim() || undefined,
        });
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your signal and hit Save again." };
      }
      if (!res.ok) {
        s.setError(res.error);
        return;
      }
      s.setSaved(true);
      setTimeout(() => s.setSaved(false), 2000);
      s.router.refresh();
    });
  }

  function onDelete() {
    if (!existing) return;
    if (!window.confirm("Remove this run? The day goes back to unlogged.")) return;
    s.setError(null);
    s.startTransition(async () => {
      let res: Awaited<ReturnType<typeof deleteLog>>;
      try {
        res = await deleteLog(existing.id);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — try again." };
      }
      if (!res.ok) {
        s.setError(res.error);
        return;
      }
      setDistance("");
      setPace("");
      setRpe(null);
      setRunType(null);
      s.setPain(false);
      s.setPainNote("");
      s.setQuestion("");
      s.setNotes("");
      s.router.refresh();
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
          Type of run <span className="font-normal text-muted">(optional)</span>
        </span>
        <div className="flex gap-1.5">
          {RUN_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={runType === t}
              onClick={() => setRunType(runType === t ? null : t)}
              className={`flex-1 rounded-lg border-[1.5px] py-2 text-[13px] font-bold ${
                runType === t
                  ? "border-navy bg-navy text-white"
                  : "border-line bg-white text-ink-2"
              }`}
            >
              {RUN_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
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

      <PainQuestionNotes s={s} />

      {s.error && <p className="mt-3 text-sm font-semibold text-orange">{s.error}</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={s.busy}
        className="mt-4 w-full rounded-xl bg-navy py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-60"
      >
        {s.busy ? "Saving…" : s.saved ? "Saved ✓" : existing ? "Update run" : "Save run"}
      </button>
      <p className="mt-2 text-center text-[11px] font-semibold text-ink-2">
        Every save goes straight to your coach — no submit day.
      </p>
      {existing && (
        <button
          type="button"
          onClick={onDelete}
          disabled={s.busy}
          className="mt-1 w-full py-1.5 text-center text-[12px] font-semibold text-muted underline-offset-2 hover:text-orange hover:underline disabled:opacity-60"
        >
          Logged the wrong day? Remove this run
        </button>
      )}
    </section>
  );
}

/** The light off-day / cross-train card. No mileage — still reports pain. */
function OffDayForm({
  dateISO,
  kind,
  existing,
  replacesRuns = 0,
  replacesFlag = false,
}: {
  dateISO: string;
  kind: Exclude<LogKind, "run">;
  existing: Log | null;
  replacesRuns?: number;
  replacesFlag?: boolean;
}) {
  const s = useDayEntry(existing);

  function onSave() {
    // Second gate: the mode switch warned, but the destructive write happens
    // here, so confirm against the state that actually exists at save time.
    if (replacesRuns > 0) {
      const what = replacesRuns > 1 ? `${replacesRuns} runs` : "the run";
      if (!window.confirm(`Saving this removes ${what} logged for this day. Continue?`)) return;
    }
    s.setError(null);
    s.startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveLog>>;
      try {
        res = await saveLog({
          log_date: dateISO,
          slot: "AM",
          kind,
          distance_mi: 0,
          pain_flag: s.pain,
          pain_note: s.painNote.trim() || undefined,
          question: s.question.trim() || undefined,
          notes: s.notes.trim() || undefined,
        });
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your signal and hit Save again." };
      }
      if (!res.ok) {
        s.setError(res.error);
        return;
      }
      s.setSaved(true);
      setTimeout(() => s.setSaved(false), 2000);
      s.router.refresh();
    });
  }

  const isCross = kind === "cross";
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="text-[15px] font-bold text-ink">
        {isCross ? "Cross-trained today" : "Off day"}
      </div>
      <p className="mt-0.5 text-[13px] text-muted">
        {isCross
          ? "Bike, pool, lift — whatever you did instead of running. No mileage counted."
          : "Planned rest. Your coach sees the day was accounted for, not forgotten."}
      </p>

      {replacesRuns > 0 && (
        <p className="mt-2 rounded-xl bg-orange-soft px-3 py-2 text-[12px] font-bold leading-snug text-orange-ink">
          Saving this removes {replacesRuns > 1 ? `the ${replacesRuns} runs` : "the run"} you already
          logged for this day
          {replacesFlag ? ", including what you flagged for your coach" : ""}.
        </p>
      )}

      {isCross && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">
            What you did <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            value={s.notes}
            onChange={(e) => s.setNotes(e.target.value)}
            placeholder="45 min bike, easy spin"
            className={INPUT}
          />
        </label>
      )}

      <PainQuestionNotes s={s} hideNotes={isCross} />

      {s.error && <p className="mt-3 text-sm font-semibold text-orange">{s.error}</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={s.busy}
        className="mt-4 w-full rounded-xl bg-navy py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-60"
      >
        {s.busy ? "Saving…" : s.saved ? "Saved ✓" : existing ? "Update" : isCross ? "Log cross-train" : "Log off day"}
      </button>
    </section>
  );
}

/** Pain toggle + question + notes — shared across run and off/cross forms. */
function PainQuestionNotes({
  s,
  hideNotes = false,
}: {
  s: ReturnType<typeof useDayEntry>;
  hideNotes?: boolean;
}) {
  return (
    <>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Anything hurting?</span>
          <button
            type="button"
            role="switch"
            aria-checked={s.pain}
            onClick={() => s.setPain(!s.pain)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              s.pain ? "bg-orange" : "bg-[#D6DAE2]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                s.pain ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        {s.pain && (
          <>
            <textarea
              value={s.painNote}
              onChange={(e) => s.setPainNote(e.target.value)}
              rows={2}
              placeholder="Where and how much? e.g. left achilles, dull after mile 5"
              className={`${INPUT} mt-2 resize-none leading-relaxed`}
            />
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-soft px-2.5 py-1.5 text-[11px] font-bold text-orange-ink">
              ⚡ Coach sees this today
            </span>
          </>
        )}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold text-ink-2">Question for coach</span>
        <input
          value={s.question}
          onChange={(e) => s.setQuestion(e.target.value)}
          placeholder="Flats or spikes for Saturday?"
          className={INPUT}
        />
      </label>

      {!hideNotes && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Notes</span>
          <textarea
            value={s.notes}
            onChange={(e) => s.setNotes(e.target.value)}
            rows={3}
            placeholder="Route, who you ran with, how it felt…"
            className={`${INPUT} resize-none leading-relaxed`}
          />
        </label>
      )}
    </>
  );
}
