# 04 — Pressure Test

**Date:** 2026-08-03 · Multi-persona adversarial pass. Purpose: find what kills this before the coach does. Verdict at the end.

---

## 1. The skeptical head coach — "Paper works. Will this cost me time?"

**The attack:** "I write a week in ten minutes at my kitchen table. I grade sheets in one sitting with a pen. You're asking me to learn software, type into forms on a laptop, and click through fifty athletes. This is *your* convenience, not mine."

**Why it lands:** the coach is the single point of failure. Athletes will adopt whatever they're told to. If the plan-builder is slower than a pen, or the review queue is slower than a stack of paper, the product is dead in week two regardless of every other merit. And this coach has decades of muscle memory in the current system — the sheet format *is* their coaching artifact.

**Holds up only if:** plan entry (group + exceptions + templates + copy-last-week) is provably ≤10 minutes, review works well on a phone/iPad from the couch, and — the escape hatch — the **paper-photo AI bridge** (01 §4) lets the coach keep the pen entirely while athletes still get digital. Design for the coach who never wanted software.

## 2. Buy-vs-build — "Final Surge exists. Why are we building anything?"

**The attack:** Final Surge is a mature training log used by college distance programs: free for athletes, $39/mo covers up to 100 athletes, college discounts on request, native apps, device sync, years of hardening. You're an intern proposing to rebuild it in four weekends. Cost is not an argument — a Power-4 program can afford $470/yr without blinking. The honest comparison is *your unbuilt software vs. their shipped product*, and shipped wins by default.

**The honest response:**
- Concede cost immediately; it's not the differentiator.
- The differentiators are real but narrow: (a) exact replication of *this staff's* sheet and grading workflow — generic logs make the coach adapt to the tool; (b) the question/flag routing loop, which is the actual daily pain; (c) data + roadmap ownership — features on request in days, not feature-request queues; (d) zero per-seat politics with the department.
- **Do the honest thing: put Final Surge in front of the coach as the benchmark.** If the coach looks at it and says "this is fine," buying is the right answer and William should say so first — that judgment call, made against his own project, is worth more with this staff than the software. Build only if the coach's reaction is "this doesn't match how we work" — which is likely, but must be *observed, not assumed*.

**Verdict on this attack: strongest objection in the doc. Survivable, but only via the demo-the-alternative move.**

## 3. The athlete — "Another app I have to open every day."

**The attack:** athletes currently scribble the week on paper in two minutes Sunday night, half from memory. Daily logging is a new *habit*, not a new tool. Week 3 compliance will crater once novelty fades; then the coach dashboard shows a wall of red and the coach concludes the software failed.

**Realities to design around:** the paper system *also* runs on Sunday-night backfill — digital doesn't create that problem, it just makes it visible. So: (a) logging must be <60 seconds, three taps from lock screen (installed PWA); (b) backfill stays legal — parity with paper is the floor, daily is the bonus; (c) reminders are gentle, not naggy; (d) the pilot group must include habitual backfillers, not just the diligent — otherwise the pilot lies to us. If pilot logging is *worse* than paper after 3 weeks, that's a kill signal, not a marketing problem.

## 4. The politics nobody is naming — "This dashboard measures the coach."

**The attack:** the stated pain includes "hard to get actual comments back." A review queue with timestamps makes coach responsiveness *visible and measurable* — built by an athlete on the team. If a coach feels audited by their own runner's software, this dies for reasons nobody will say out loud.

**Mitigation:** no coach-facing response-time metrics, ever, in v1. No "avg time to review" stat. The queue is a to-do list, not a scoreboard. Frame every screen as reducing coach workload. This is the sharpest *unstated* risk in the project — Will's positioning as helpful-athlete-who-builds must never tip into monitoring the staff. (Same instinct as Secretariat's "never mis-route a note": the trust property is the product.)

## 5. Compliance / department — "Who approved this?"

**The attack:** a student-built app on a personal Supabase account holding the training and pain notes of a D1 roster. If it surfaces via an injury dispute or a records request and the department never knew, that's bad for the *coach*, who approved it informally.

**Mitigation:** coach clears it with ops/IT before full rollout (pilot with volunteers is low-stakes); no medical detail beyond what the paper sheet already holds; RLS so athletes see only their own data; CSV export = no lock-in; team owns the accounts on paper. Also flag to the coach: prescribed-training archives are permanent records — mostly a benefit (documentation), but they should know. **Do not skip this because it's boring. It's the difference between "team tool" and "liability."**

## 6. The mirror — William's own incentives

**The attack:** you're an eGateway intern with recruiting season approaching, and you're proposing 4–6 weeks of build. The risk isn't that you can't build it — Claude Code makes the MVP genuinely achievable — it's that you build it, season starts, *maintenance* lands during October (bugs at 10pm before a meet), and it competes with the work that actually determines your next job. Also check the motivation honestly: is this solving the team's problem or scratching a builder's itch? (It can be both; know the ratio.)

**Mitigation:** boring stack, tiny scope, parallel-paper pilot means failure costs nothing; explicit decision that Phase 2+ only happens if adoption gates pass. The August build window is real (pre-season, pre-recruiting-crunch). But cap it: if MVP isn't pilotable by Sept 15, cut scope, don't extend timeline.

## 7. Technical attacks (rapid fire)

- **"Garmin sync" in the pitch is a lie-in-waiting.** Garmin's developer program is enterprise-only; a student project likely won't be approved. Strava's API terms (since late 2024) bar showing an athlete's data to anyone but themselves — the coach view is exactly what's prohibited. **Never promise sync.** .FIT/.TCX file upload is the honest bridge; it's also friction athletes may skip. Manual entry is the real product. ✅ Already reflected in 01/02/03.
- **Supabase free tier pauses after ~1 week inactivity** — an off-season trap (December: team opens app, it's down). Go Pro ($25/mo) at full rollout or accept the risk knowingly.
- **PWA push on iOS** requires the app be added to home screen and has quirks. Test on real athlete phones in week one of the pilot; if push is flaky, email reminders are the fallback, and native becomes a Phase-3 question.
- **One-developer bus factor** — mitigated by docs + export + "worst case: paper," but real. Don't build anything a successor manager couldn't operate from the admin panel.

## 8. Verdict

**Proceed — with three conditions.** The pain is real, the killer feature (same-day flag visibility) is something neither paper nor a generic log delivers as well, the cost is trivial, and the downside is capped by the parallel-paper pilot. But:

1. **Coach co-design before any code.** The 30-minute sheet walkthrough is the gate. No session → no build.
2. **Show Final Surge honestly** (or be fully ready for the question). If the coach prefers buying, recommend buying. That outcome is a win, not a loss.
3. **Adoption gates at ~Oct 1, decided in advance:**
   - ≥80% of pilot-athlete days logged within 48h of the run
   - Coach has reviewed ≥2 consecutive weeks inside the app without being chased
   - At least one mid-week flag caught and acted on (the killer feature demonstrated live)
   - Coach answer to "did this make your week easier?" is an unprompted yes

**Kill criteria (write them down now, honor them later):** coach won't engage with the dashboard by week 3 of pilot; pilot logging quality falls below the paper baseline; athletics ops says no. Any one → export the data, hand back the paper, keep the goodwill. The worst outcome isn't a dead project — it's a half-alive one the team resents.
