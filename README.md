# HoosLog

A digital training log for the UVA men's distance program — the weekly paper training sheet, digitized, with nothing about the coaching changed.

The coach uploads his weekly plan (workout names + each athlete's weekly mileage goal) on Monday and grades the week Sunday night with the same per-day checkmarks and comments he writes in red pen today. Athletes log each day in under 45 seconds — distance, pace, effort, a dedicated **"anything hurting?" flag the coach sees the same day** instead of at Sunday hand-in, a question field, and notes. That same-day visibility of pain flags and questions is the whole reason this exists: paper has a five-day blind spot.

## Status

**Pre-build.** Docs and mockups only — no application code yet, by design. The build starts after the coach co-design session locks the remaining decisions. Do not add app scaffolding before then.

**Read [`CLAUDE.md`](./CLAUDE.md) first, every session.** It is the project's anti-staleness anchor: current status, the full numbered list of locked decisions, and open items. If this README and CLAUDE.md ever disagree, CLAUDE.md wins.

## Stack (locked — see docs/08)

Next.js 15 (App Router, TypeScript) PWA on Vercel · Supabase (Postgres, Auth, RLS, Realtime) · Web Push + Resend · $0 pilot, ~$25/mo steady state. One repo, no separate backend, no ORM, RLS everywhere, soft deletes, ~10 tables. 24 athletes ≈ 6k log rows/season: every engineering hour goes to UI speed, none to scale.

## Repository layout

| Path | Contents |
|---|---|
| `CLAUDE.md` | **Start here.** Status log, locked decisions (numbered), open items, conventions |
| `docs/01–05` | Concept, product spec + gap analysis, coach proposal, adversarial pressure test, athlete one-pager |
| `docs/08` | Infrastructure scope: stack, costs, what we deliberately don't need, build order |
| `docs/11` | Dictionary — team vocabulary (TR, LR, fartlek notation…) and product terms; also the plan-importer's parsing vocabulary |
| `docs/mockups/` | Athlete portal mockups (06), interactive demo (07 — throwaway, never grows into the app), coach portal grid-vs-cards (09), and the real paper sheet photo (10 — ground truth) |
| `.env.example` | Environment template. Copy to `.env.local`, fill locally, never commit real values |

## Principles that don't move

Group-based plan authoring. PWA, no app stores. No Garmin/Strava sync promises (`.FIT` upload is the Phase-2 bridge). No coach response-time metrics, ever. No scores in grading — checkmarks and comments. One-click CSV export of everything at all times: worst case is always "export and go back to paper," and lock-in stays at zero. Pilot runs with paper in parallel; paper retires when the coach says so, not before.
