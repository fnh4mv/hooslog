"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, fmtMonthDay, fromISO } from "@/lib/dates";
import { parseMileageInput } from "@/lib/goal-input";
import { GROUPS, GROUP_LABELS, GROUP_SHORT, type TrainingGroup } from "@/lib/types";
import type { BuilderWeek } from "@/lib/queries";
import { postWeek, type PostError } from "./actions";

/* ===========================================================================
   The week builder.

   Everything the spreadsheet got wrong is a category of mistake this screen
   cannot make, and it is worth naming them because each one cost a real
   upload:

     · "12-13" is not a date here. It is text in a text box, parsed by the
       same rule the importer uses, and echoed back as "avg 12.5" before
       anything is posted. Excel converted it the moment it was typed.
     · There are no columns to reorder. A field is a labelled box.
     · The roster comes from the database, so no counter row is ever read as
       an athlete and no email ever fails to match an account.
     · A training group is a toggle showing what the athlete IS right now.
       Blank-means-no-change, which left twenty-seven men on the wrong
       schedule, is not representable.
     · The long run is a field on the form. It cannot be silently dropped,
       because what is on screen is what gets posted.
   ========================================================================= */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Row = {
  email: string;
  name: string;
  short: string;
  /** What they are in the database right now — the baseline for "who moves". */
  wasGroup: TrainingGroup;
  group: TrainingGroup;
  goal: string;
  longRun: string;
  /** What is already posted for this week, so a cleared box can tell the truth. */
  savedGoal: string;
  savedLongRun: string;
};

type Plans = Record<TrainingGroup, string[]>;

type Draft = { plans: Plans; rows: Record<string, Pick<Row, "group" | "goal" | "longRun">> };

const draftKey = (weekISO: string) => `hooslog:week-draft:${weekISO}`;

function rowsFrom(data: BuilderWeek): Row[] {
  return data.athletes.map((a) => ({
    email: a.email,
    name: a.name,
    short: a.short,
    wasGroup: a.group,
    group: a.group,
    goal: a.goal,
    longRun: a.longRun,
    savedGoal: a.goal,
    savedLongRun: a.longRun,
  }));
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon Sep 21" — the day name matters, because the one thing a coach must
 *  never be unsure of is which Monday he is filling in. */
function fmtLongDay(d: Date): string {
  return `${DOW_SHORT[d.getDay()]} ${fmtMonthDay(d)}`;
}

/** How far off "now" this week is, in the words a coach would use. */
function weekOffsetLabel(weekISO: string, currentISO: string): string {
  const a = fromISO(weekISO);
  const b = fromISO(currentISO);
  if (!a || !b) return "";
  const weeks = Math.round((a.getTime() - b.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  if (weeks === -1) return "Last week";
  return weeks > 0 ? `${weeks} weeks ahead` : `${-weeks} weeks ago`;
}

/**
 * Which week am I posting? The spreadsheet answered this with a date typed
 * into cell B3, which is exactly the kind of thing that goes wrong quietly.
 * Here it is the largest text on the page, spelled out with day names and
 * both ends of the week, and it says in plain words whether that is this
 * week, next week, or one already gone.
 */
function WeekBanner({
  weekStartISO,
  currentMondayISO,
  alreadyPosted,
  prevWeekISO,
  nextWeekISO,
  compact,
}: {
  weekStartISO: string;
  currentMondayISO: string;
  alreadyPosted: boolean;
  prevWeekISO?: string;
  nextWeekISO?: string;
  compact?: boolean;
}) {
  const monday = fromISO(weekStartISO);
  if (!monday) return null;
  const sunday = addDays(monday, 6);
  const offset = weekOffsetLabel(weekStartISO, currentMondayISO);
  const isPast = weekStartISO < currentMondayISO;

  return (
    <section
      className={`rounded-2xl border-[1.5px] bg-white px-4 py-3.5 ${
        isPast ? "border-orange" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted">
            {alreadyPosted ? "EDITING THE WEEK OF" : "POSTING THE WEEK OF"}
          </p>
          <p className="text-[22px] font-extrabold leading-tight tracking-tight text-navy">
            {fmtLongDay(monday)} – {fmtLongDay(sunday)}
          </p>
        </div>

        <span
          className={`self-end rounded-lg px-2 py-1 text-[11px] font-extrabold ${
            isPast ? "bg-orange-soft text-orange-ink" : "bg-navy-soft text-navy"
          }`}
        >
          {offset}
        </span>

        {!compact && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {prevWeekISO && (
              <Link
                href={`/coach/week?week=${prevWeekISO}`}
                className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:border-navy hover:text-navy"
              >
                ‹ Week before
              </Link>
            )}
            {weekStartISO !== currentMondayISO && (
              <Link
                href="/coach/week"
                className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:border-navy hover:text-navy"
              >
                This week
              </Link>
            )}
            {nextWeekISO && (
              <Link
                href={`/coach/week?week=${nextWeekISO}`}
                className="rounded-lg border-[1.5px] border-navy bg-navy px-2.5 py-1 text-[11px] font-bold text-white hover:bg-navy/90"
              >
                Week after ›
              </Link>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 text-[13px] font-semibold text-ink-2">
        {alreadyPosted
          ? "A week is already posted here — these boxes show what's live. Posting replaces it; every other week stays as it is."
          : "Nothing is posted for this week yet."}
        {isPast && " This week has already been run."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ pieces */

function Card({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-[1.5px] border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-extrabold tracking-tight text-navy">{title}</h2>
        {hint && <p className="text-[12px] text-ink-2">{hint}</p>}
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function MiniButton({
  onClick,
  children,
  title,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The group toggle. Always explicit: one of the two is always chosen. */
function GroupToggle({
  value,
  moved,
  onChange,
}: {
  value: TrainingGroup;
  moved: boolean;
  onChange: (g: TrainingGroup) => void;
}) {
  return (
    <div
      className={`inline-flex overflow-hidden rounded-lg border-[1.5px] ${moved ? "border-orange" : "border-line"}`}
    >
      {GROUPS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          aria-pressed={value === g}
          className={`px-2.5 py-1 text-[11px] font-bold ${
            value === g ? "bg-navy text-white" : "bg-white text-ink-2 hover:bg-navy-soft"
          }`}
        >
          {GROUP_SHORT[g]}
        </button>
      ))}
    </div>
  );
}

/** A mileage box plus the one line of feedback that makes it trustworthy. */
function MileageBox({
  value,
  saved,
  kind,
  onChange,
  onEnter,
  inputRef,
}: {
  value: string;
  saved: string;
  kind: "weekly goal" | "long run";
  onChange: (v: string) => void;
  onEnter: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const parsed = parseMileageInput(value, kind);
  const bad = !parsed.ok;
  // A range or a minimum is shown back as the number it will actually track,
  // so "12-13" reads as "avg 12.5" and never as December.
  const echo =
    parsed.ok && !parsed.empty && parsed.label
      ? parsed.label.includes("+")
        ? `min ${parsed.value}`
        : `avg ${parsed.value}`
      : null;
  // Blank where something is already posted: import_week leaves it alone, so
  // say that rather than letting the empty box imply it was removed.
  const keeps = !value.trim() && saved.trim() ? saved.trim() : null;

  return (
    <div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        inputMode="text"
        placeholder="—"
        aria-invalid={bad}
        className={`w-[74px] rounded-lg border-[1.5px] px-2 py-1 text-[13px] font-semibold tabular-nums outline-none focus:border-navy ${
          bad ? "border-orange bg-orange-soft text-orange-ink" : "border-line bg-white text-ink"
        }`}
      />
      {bad && <p className="mt-0.5 max-w-[190px] text-[10px] font-semibold leading-tight text-orange-ink">{parsed.message}</p>}
      {!bad && echo && <p className="mt-0.5 text-[10px] font-semibold text-muted tabular-nums">{echo}</p>}
      {!bad && !echo && keeps && (
        <p className="mt-0.5 max-w-[190px] text-[10px] font-semibold leading-tight text-muted">
          blank keeps {keeps}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- main  */

export function WeekBuilder({
  data,
  weekStartISO,
  currentMondayISO,
  prevWeekISO,
  nextWeekISO,
}: {
  data: BuilderWeek;
  weekStartISO: string;
  currentMondayISO: string;
  prevWeekISO: string;
  nextWeekISO: string;
}) {
  const [plans, setPlans] = useState<Plans>(() => ({
    distance: [...data.plans.distance],
    mid: [...data.plans.mid],
  }));
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(data));
  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<PostError[]>([]);
  const [posted, setPosted] = useState<{ goalsSet: number; toMid: number; toDistance: number } | null>(null);
  const [restored, setRestored] = useState(false);

  const goalRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const longRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const monday = fromISO(weekStartISO);
  const isPastWeek = weekStartISO < currentMondayISO;

  /* ---- draft autosave. A half-built week must survive a refresh. ---- */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(weekStartISO));
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (!draft?.plans || !draft?.rows) return;
      setPlans({
        distance: Array.isArray(draft.plans.distance) ? draft.plans.distance.slice(0, 7) : [...data.plans.distance],
        mid: Array.isArray(draft.plans.mid) ? draft.plans.mid.slice(0, 7) : [...data.plans.mid],
      });
      // Merge by email so a draft written before an athlete joined still loads,
      // and a new athlete arrives with his real values rather than a blank.
      setRows((cur) =>
        cur.map((r) => {
          const d = draft.rows[r.email];
          return d ? { ...r, group: d.group ?? r.group, goal: d.goal ?? r.goal, longRun: d.longRun ?? r.longRun } : r;
        }),
      );
      setRestored(true);
    } catch {
      /* a corrupt or blocked draft is not worth breaking the page over */
    }
    // Only ever on mount for this week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO]);

  useEffect(() => {
    if (posted) return;
    try {
      const draft: Draft = {
        plans,
        rows: Object.fromEntries(rows.map((r) => [r.email, { group: r.group, goal: r.goal, longRun: r.longRun }])),
      };
      window.localStorage.setItem(draftKey(weekStartISO), JSON.stringify(draft));
    } catch {
      /* private mode, blocked storage — the form still works */
    }
  }, [plans, rows, weekStartISO, posted]);

  /* ---------------------------------------------------------- derived ---- */
  const setRow = (email: string, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.email === email ? { ...r, ...patch } : r)));

  const setDay = (group: TrainingGroup, day: number, text: string) =>
    setPlans((cur) => ({ ...cur, [group]: cur[group].map((t, i) => (i === day ? text : t)) }));

  const counts = useMemo(() => {
    const c: Record<TrainingGroup, number> = { distance: 0, mid: 0 };
    for (const r of rows) c[r.group] += 1;
    return c;
  }, [rows]);

  const moves = useMemo(
    () => rows.filter((r) => r.group !== r.wasGroup).map((r) => ({ short: r.short, from: r.wasGroup, to: r.group })),
    [rows],
  );

  const fieldErrors = useMemo(() => {
    const out: { email: string; short: string; message: string }[] = [];
    for (const r of rows) {
      const g = parseMileageInput(r.goal, "weekly goal");
      if (!g.ok) out.push({ email: r.email, short: r.short, message: g.message });
      const l = parseMileageInput(r.longRun, "long run");
      if (!l.ok) out.push({ email: r.email, short: r.short, message: l.message });
    }
    return out;
  }, [rows]);

  const goalsFilled = useMemo(
    () => rows.filter((r) => r.goal.trim() || r.longRun.trim()).length,
    [rows],
  );

  /** Things worth saying out loud before posting. Not errors — judgement calls
   *  the coach is allowed to make, but never by accident. */
  const warnings = useMemo(() => {
    const w: string[] = [];
    const distanceEmpty = plans.distance.every((t) => !t.trim());
    const midEmpty = plans.mid.every((t) => !t.trim());
    if (counts.distance > 0 && distanceEmpty) {
      w.push(`${counts.distance} on the distance schedule, but no distance workouts — they'll open the app to an empty week.`);
    }
    if (counts.mid > 0 && midEmpty) {
      w.push(`${counts.mid} on the mid-distance schedule, but no mid-distance workouts — they'll open the app to an empty week.`);
    }
    if (counts.mid === 0 && !midEmpty) {
      w.push("The mid-distance schedule has workouts but nobody is on it.");
    }
    if (goalsFilled === 0) {
      w.push("Nobody has a weekly goal — the workouts post, but no one gets a mileage target.");
    }
    for (const r of rows) {
      const g = parseMileageInput(r.goal, "weekly goal");
      const l = parseMileageInput(r.longRun, "long run");
      if (g.ok && !g.empty && l.ok && !l.empty && l.value > g.value) {
        w.push(`${r.short}'s long run (${l.value}) is longer than his whole week (${g.value}). Check those two boxes.`);
      }
    }
    if (isPastWeek) {
      w.push(`This is a past week — this week starts ${fmtMonthDay(fromISO(currentMondayISO) ?? new Date())}.`);
    }
    return w;
  }, [plans, counts, rows, goalsFilled, isPastWeek, currentMondayISO]);

  /* ----------------------------------------------------------- actions --- */
  function startFromLastWeek() {
    const prev = data.previous;
    if (!prev) return;
    setPlans({ distance: [...prev.plans.distance], mid: [...prev.plans.mid] });
    setRows((cur) =>
      cur.map((r) => {
        const g = prev.goals[r.email];
        return g ? { ...r, goal: g.goal, longRun: g.longRun } : r;
      }),
    );
  }

  function copyDistanceToMid() {
    setPlans((cur) => ({ ...cur, mid: [...cur.distance] }));
  }

  /** Fill every row below the first non-empty one with that value. The single
   *  ergonomic thing a spreadsheet does better than a form, put back. */
  function fillDown(which: "goal" | "longRun") {
    setRows((cur) => {
      const seed = cur.find((r) => r[which].trim());
      if (!seed) return cur;
      const value = seed[which];
      return cur.map((r) => (which === "goal" ? { ...r, goal: value } : { ...r, longRun: value }));
    });
  }

  function focusNext(which: "goal" | "longRun", email: string) {
    const i = rows.findIndex((r) => r.email === email);
    const next = rows[i + 1];
    if (!next) return;
    const ref = which === "goal" ? goalRefs.current[next.email] : longRefs.current[next.email];
    ref?.focus();
    ref?.select();
  }

  async function submit() {
    setBusy(true);
    setServerErrors([]);
    const result = await postWeek({
      weekStartISO,
      plans: { distance: plans.distance, mid: plans.mid },
      rows: rows.map((r) => ({ email: r.email, group: r.group, goal: r.goal, longRun: r.longRun })),
    });
    setBusy(false);
    if (!result.ok) {
      setServerErrors(result.errors);
      setStage("edit");
      return;
    }
    try {
      window.localStorage.removeItem(draftKey(weekStartISO));
    } catch {
      /* nothing to clean up */
    }
    setPosted({
      goalsSet: result.goalsSet,
      toMid: result.movedToMid.length,
      toDistance: result.movedToDistance.length,
    });
  }

  /* ------------------------------------------------------------ posted --- */
  if (posted) {
    return (
      <div className="rounded-2xl border-[1.5px] border-green bg-green-soft p-5">
        <h2 className="text-[17px] font-extrabold text-navy">
          Week of {monday ? fmtMonthDay(monday) : weekStartISO} is posted.
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">
          {posted.goalsSet} {posted.goalsSet === 1 ? "athlete" : "athletes"} got a goal
          {posted.toMid > 0 && `, ${posted.toMid} moved to mid-distance`}
          {posted.toDistance > 0 && `, ${posted.toDistance} moved to distance`}. Everyone sees it now.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/coach"
            className="rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            Back to the team
          </Link>
          <Link
            href={`/coach/week?week=${nextWeekISO}`}
            className="rounded-xl border-[1.5px] border-line bg-white px-4 py-2 text-sm font-bold text-ink-2 hover:border-navy hover:text-navy"
          >
            Build next week
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ review --- */
  if (stage === "review") {
    return (
      <div className="flex flex-col gap-4">
        <WeekBanner
          weekStartISO={weekStartISO}
          currentMondayISO={currentMondayISO}
          alreadyPosted={data.alreadyPosted}
          compact
        />
        <Card title="Ready to post">
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <div key={g}>
                  <h3 className="text-[12px] font-extrabold tracking-[0.06em] text-muted">
                    {GROUP_LABELS[g].toUpperCase()} · {counts[g]} {counts[g] === 1 ? "ATHLETE" : "ATHLETES"}
                  </h3>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {plans[g].map((t, i) => (
                      <li key={i} className="flex gap-2 text-[13px]">
                        <span className="w-[42px] shrink-0 font-bold text-muted">{DAY_NAMES[i].slice(0, 3)}</span>
                        <span className={t.trim() ? "text-ink" : "text-muted"}>{t.trim() || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {moves.length > 0 && (
              <div className="rounded-xl border-[1.5px] border-orange bg-orange-soft px-3 py-2">
                <p className="text-[12px] font-extrabold tracking-[0.06em] text-orange-ink">CHANGING SCHEDULE</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {moves.map((m) => (
                    <li key={m.short} className="text-[13px] font-semibold text-ink">
                      {m.short}: {GROUP_LABELS[m.from]} → {GROUP_LABELS[m.to]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[13px] text-ink-2">
              <span className="font-bold text-ink">{goalsFilled}</span> of {rows.length} athletes have a goal or long run filled in.
            </p>

            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {warnings.map((w, i) => (
                  <li key={i} className="text-[12px] font-semibold text-orange-ink">• {w}</li>
                ))}
              </ul>
            )}

            {serverErrors.length > 0 && (
              <ul className="flex flex-col gap-1">
                {serverErrors.map((e, i) => (
                  <li key={i} className="text-[13px] font-bold text-orange-ink">{e.where}: {e.message}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-xl bg-orange px-5 py-2.5 text-sm font-extrabold text-white hover:bg-orange/90 disabled:opacity-60"
              >
                {busy ? "Posting…" : "Post this week"}
              </button>
              <button
                type="button"
                onClick={() => setStage("edit")}
                disabled={busy}
                className="rounded-xl border-[1.5px] border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-2 hover:border-navy hover:text-navy"
              >
                Keep editing
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* -------------------------------------------------------------- edit --- */
  return (
    <div className="flex flex-col gap-4">
      {restored && (
        <p className="rounded-xl border-[1.5px] border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink-2">
          Picked up where you left off — this week had an unposted draft saved on this device.
        </p>
      )}

      <WeekBanner
        weekStartISO={weekStartISO}
        currentMondayISO={currentMondayISO}
        alreadyPosted={data.alreadyPosted}
        prevWeekISO={prevWeekISO}
        nextWeekISO={nextWeekISO}
      />

      {serverErrors.length > 0 && (
        <div className="rounded-xl border-[1.5px] border-orange bg-orange-soft px-3 py-2">
          <p className="text-[12px] font-extrabold tracking-[0.06em] text-orange-ink">NOTHING WAS POSTED</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {serverErrors.map((e, i) => (
              <li key={i} className="text-[13px] font-semibold text-ink">{e.where}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------------- schedules --- */}
      <Card
        title="The week"
        hint="One line per day, per schedule. Leave a day blank for no plan."
        right={
          <>
            {data.previous && (
              <MiniButton
                onClick={startFromLastWeek}
                title={`Copy the workouts and goals from the week of ${data.previous.weekStartISO}`}
              >
                Start from last week
              </MiniButton>
            )}
            <MiniButton onClick={copyDistanceToMid} title="Copy the distance column across">
              Distance → Mid-D
            </MiniButton>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="w-[92px] px-4 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">DAY</th>
                {GROUPS.map((g) => (
                  <th key={g} className="px-3 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">
                    {GROUP_LABELS[g].toUpperCase()}
                    <span className="ml-1.5 font-bold text-ink-2">{counts[g]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((day, i) => (
                <tr key={day} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 align-top">
                    <div className="text-[13px] font-extrabold text-navy">{day.slice(0, 3)}</div>
                    <div className="text-[11px] font-semibold text-muted">
                      {monday ? fmtMonthDay(addDays(monday, i)) : ""}
                    </div>
                  </td>
                  {GROUPS.map((g) => (
                    <td key={g} className="px-3 py-2 align-top">
                      <textarea
                        value={plans[g][i]}
                        onChange={(e) => setDay(g, i, e.target.value)}
                        rows={2}
                        placeholder="—"
                        className="w-full resize-y rounded-lg border-[1.5px] border-line bg-white px-2 py-1.5 text-[13px] leading-snug text-ink outline-none focus:border-navy"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------- roster --- */}
      <Card
        title="Goals"
        hint={`${rows.length} on the roster · ${counts.distance} distance · ${counts.mid} mid-D`}
        right={
          <>
            <MiniButton onClick={() => fillDown("goal")} title="Copy the first weekly goal down the column">
              Fill weekly ↓
            </MiniButton>
            <MiniButton onClick={() => fillDown("longRun")} title="Copy the first long run down the column">
              Fill long run ↓
            </MiniButton>
          </>
        }
      >
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-[14px] text-ink-2">
            Nobody has signed up yet. Once athletes create accounts they appear here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">ATHLETE</th>
                  <th className="px-3 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">SCHEDULE</th>
                  <th className="px-3 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">WEEKLY (MI)</th>
                  <th className="px-3 py-2 text-left text-[11px] font-extrabold tracking-[0.06em] text-muted">LONG RUN (MI)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.email} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <div className="text-[13px] font-bold text-ink">{r.name}</div>
                      <div className="text-[11px] text-muted">{r.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <GroupToggle
                        value={r.group}
                        moved={r.group !== r.wasGroup}
                        onChange={(g) => setRow(r.email, { group: g })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MileageBox
                        value={r.goal}
                        saved={r.savedGoal}
                        kind="weekly goal"
                        onChange={(v) => setRow(r.email, { goal: v })}
                        onEnter={() => focusNext("goal", r.email)}
                        inputRef={(el) => {
                          goalRefs.current[r.email] = el;
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MileageBox
                        value={r.longRun}
                        saved={r.savedLongRun}
                        kind="long run"
                        onChange={(v) => setRow(r.email, { longRun: v })}
                        onEnter={() => focusNext("longRun", r.email)}
                        inputRef={(el) => {
                          longRefs.current[r.email] = el;
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.pending.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <p className="text-[11px] font-extrabold tracking-[0.06em] text-muted">
              ON THE ROSTER, NO ACCOUNT YET — {data.pending.length}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {data.pending.map((a) => (
                <li key={a.email} className="text-[13px] text-ink-2">
                  <span className="font-bold text-ink">{a.name}</span>{" "}
                  <span className="text-muted">{a.email}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-2">
              They can sign up — they&apos;re on the allowlist — but a goal needs an
              account to live on, so they&apos;ll appear in the grid above the moment
              they create one. Post the week now; their goals can go in next week,
              or re-post this week once they&apos;re in.
            </p>
          </div>
        )}
      </Card>

      {/* --------------------------------------------------------- post --- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setStage("review")}
          disabled={fieldErrors.length > 0}
          className="rounded-xl bg-orange px-5 py-2.5 text-sm font-extrabold text-white hover:bg-orange/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Check it over
        </button>
        {fieldErrors.length > 0 ? (
          <p className="text-[13px] font-semibold text-orange-ink">
            {fieldErrors.length} {fieldErrors.length === 1 ? "box needs" : "boxes need"} fixing first —{" "}
            {[...new Set(fieldErrors.map((f) => f.short))].join(", ")}.
          </p>
        ) : (
          <p className="text-[13px] text-ink-2">
            Nothing posts until you&apos;ve seen the summary.{" "}
            <Link href={`/coach/week?week=${prevWeekISO}`} className="font-bold text-orange hover:underline">
              Previous week
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
