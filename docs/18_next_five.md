# 18 — The next five things (2026-08-31)

Filter used: the **Oct 1 adoption gates** already written down in `04 §8`. Not
"what would be cool," but "what moves one of these four numbers."

1. ≥80% of athlete-days logged within 48h of the run
2. Coach reviews ≥2 consecutive weeks in the app without being chased
3. At least one mid-week flag caught and acted on
4. Coach's unprompted yes to "did this make your week easier?"

Everything below is small. Nothing below adds a table except #4's nothing, and
nothing below adds a score, a metric on the coach, or a notification.

---

## 1. Stop losing what the athlete typed  (gate 1)

`docs/13` Athlete UX #2, still open. Nothing typed persists until Save, so
tapping another day chip or backgrounding the phone silently discards the
entry. That includes a pain note.

This is data loss on the input path of the one feature the product exists for.
An athlete who loses an entry once logs less carefully forever, and a lost
entry is an unlogged day, which is gate 1 measured directly.

**Build:** hold day-form state in a parent-level map keyed by date instead of
remounting per chip, plus a `localStorage` draft keyed by athlete+date so a
backgrounded phone survives. ~30 lines. No schema.

## 2. Make the promise visible before it is earned  (gate 3)

`day-forms.tsx:658` renders `⚡ Coach sees this today` **inside** `{s.pain && ...}`.
The app's entire reason to exist is only stated after the athlete has already
flagged. On day one, when he is deciding whether this thing is worth trusting,
it is invisible.

Move it above the toggle and make it unconditional: "Anything hurting? Your
coach sees this today, not Sunday." That sentence is the product.

**Build:** move a span, reword it, drop the conditional. ~5 lines, and the
highest value-per-line on this list.

## 3. One line telling the coach who is missing  (gate 2)

`docs/13` Coach workflow #1. At 30 athletes the grid is 210 cells, and there is
no way to see who has not logged or who never signed up without reading all of
them. A coach who has to audit a grid to find the gaps stops opening the grid,
and gate 2 is exactly "does he keep opening it."

One strip above the roster: *"9 haven't logged since Wednesday · 3 on the roster
never signed up."* Both link to the names.

**Build:** the log data is already in `getCoachWeek`. Signed-up-vs-roster is one
extra query, and `athlete_emails` is already coach-readable (verified in 0005's
RLS). Small. No schema.

## 4. CSV export  (the promise currently not kept)

The README states it as a principle that does not move: *"One-click CSV export
of everything at all times: worst case is always 'export and go back to paper,'
and lock-in stays at zero."* It was cut in the locked-22 trial cuts and never
built. `grep` finds no CSV, no export route, no print stylesheet anywhere in
`src/`.

The kill-criteria plan in `04 §8` is literally "export the data, hand back the
paper, keep the goodwill." Today that is not executable. That is the gap worth
closing, not because anyone will use it weekly, but because being able to walk
away is what makes it safe for Dunbar to commit. It is also the honest
foundation for the month report (see below).

**Build:** one route handler streaming a flat CSV of logs + goals + plans for a
date range, coach-scoped by the existing RLS. No new dependency. No schema.

## 5. Six-week mileage on the coach's athlete page  (gate 4)

`getHistory()` is already written, already tested, already serving the athlete's
History tab. The coach drill-in does not call it. Today a coach looking at an
athlete sees one week and has to click backwards to answer "is he ramping too
fast," which is the question upstream of the injury the pain flag reports
after it has already happened.

**Build:** call the existing function, render six bars above the day cards.
Near-zero new code, and it is the kind of thing that makes a coach say the
thing gate 4 is asking about.

---

# On the two ideas

## Custom tracked fields (sleep, HR, HRV): not in the five

This is not a new question. `02 §6 #8` asks it directly — *"Wellness
(sleep/soreness): does the staff want it, or is it scope creep? (Default:
out.)"* — and it was never resolved with the coach. It is still an open
decision, and the honest answer is to ask Dunbar rather than to build it.

Four reasons it is weaker than it looks:

1. **Athlete-private data has no feedback loop.** The engine of this whole app
   is "the coach sees it." A field nobody reviews stops getting filled in
   within about two weeks, and then the settings page is a graveyard the
   athlete walks past every day.
2. **The watch already knows.** HRV, resting HR and sleep are measured
   automatically by the Garmins and Whoops these guys already wear. Manual
   entry of device-measured metrics is the most reliably abandoned category in
   training logs, and locked 4 rules out the sync that would make it painless.
3. **It is the biggest item on this list, not the smallest.** "Fields the
   athlete defines" means field definitions, types, validation, per-athlete
   storage, rendering, and history rendering. That is a schema generalization,
   and generalizations are where small apps go to die. Every other item here is
   under a hundred lines.
4. **It fights the 45-second constraint,** which is the entire athlete-side
   product.

**If it gets built anyway, build this version instead:** one fixed row of taps
on the existing day form — sleep hours and soreness 1–5, no free text, no
custom definitions, no settings page — and make it visible to the coach as a
trend. Fixed beats custom because it is comparable across athletes, and coach
visibility is what keeps it alive. Ship it only after Dunbar says he wants it,
and only after the Oct 1 gate.

## "Download month report": right instinct, expensive mechanism

An API that generates a document is the costly path: a dependency, a key, a bill,
a failure mode, and a thing that breaks silently when the coach needs it.

The cheap 90% is a **month view with a print stylesheet**. Cmd-P gives a PDF.
No dependency, no key, no API cost, works when the network does not, and it
lands on the printable-week-view item William already leaned yes on. Dunbar is
a paper coach — a page that prints cleanly is closer to what he wants than a
generated document anyway.

Build #4 first. Export is the substrate; the report is a view over it.

---

## Deliberately not on this list

- **Real push notifications.** Correctly deferred in `13` — PWA install, VAPID
  keys, service worker, cron. Real infrastructure, and the in-app nudge covers
  the trial.
- **Anything that adds a score, a streak with teeth, or a coach
  response-time metric.** Locked 7 and 16. The review queue is a to-do list,
  never a scoreboard.
