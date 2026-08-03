# 08 — Infrastructure & Build Stack Scope

**Date:** 2026-08-03 · **Status:** Scoped, pre-build · **Supersedes nothing — implements locked decision 3 in CLAUDE.md**

Design constraints this doc optimizes for: **24 athletes** (men's distance) + 2–4 coaches · UI speed *is* the product · one part-time builder (William + Claude Code) · $0 pilot cost · zero lock-in (CSV export always works).

---

## 1. The stack — everything we need

| Layer | Choice | Cost | Why |
|---|---|---|---|
| Frontend | **Next.js 15** (App Router, TypeScript) + Tailwind, installable **PWA** | $0 | One app, two role views (athlete portal / coach portal) — not two apps. Matches eGOS conventions William already builds in. |
| Backend + DB | **Supabase** — Postgres, Auth, RLS, Realtime | $0 free tier → $25/mo Pro | No separate API server. `supabase-js` + generated TS types straight from server components/actions. The data model is 02 §1. |
| Hosting | **Vercel** Hobby tier, GitHub auto-deploy | $0 | Purpose-built for Next.js; preview deploys per branch for free. See §2 on why not AWS/Azure. |
| Auth | Supabase Auth, **UVA email domain gate**, magic-link (no passwords for athletes to forget) | $0 | Magic-link vs. password is a co-design confirm, not a blocker. |
| Notifications | Web Push (VAPID, free) + **Resend** email fallback | $0 | Free tiers cover 24 athletes forever. |
| Claude — build time | **Claude Code / Cowork on William's existing account** | $0 incremental | This is how the app gets built. No new account needed. |
| Claude — runtime | **Anthropic API key** — Phase 2 ONLY (paper-plan photo → structured week import; maybe weekly coach digest) | ~$1–5/mo when used | **MVP has zero runtime AI.** Don't create the key until the feature is real. |
| Domain | `hooslog.vercel.app` for pilot → custom ~$12/yr later | $0 pilot | |
| Repo / CI | GitHub private repo (`hooslog`), Vercel handles CI/CD | $0 | No GitHub Actions needed at this scale. |
| Monitoring | Vercel logs + Supabase logs to start; Sentry free tier post-pilot if warranted | $0 | |
| Backups / exit | Supabase Pro daily backups at steady state; **in-app one-click CSV export from day one** | in Pro | The "worst case: back to paper" guarantee from 02 §5. |

**Total: $0 pilot → ~$25/mo steady state.** (Unchanged from 02 §3; Final Surge benchmark $39/mo.)

## 2. Why not AWS/Azure — settled, keep it settled

Locked decision 3 already picked Vercel over Azure/AWS, and nothing about a 24-athlete roster reopens it. AWS/Azure buy you VPCs, containers, and ops burden — all cost and zero benefit at this scale, plus slower deploys and a worse free tier for Next.js. The only event that reopens this: UVA athletics IT mandates department-controlled hosting. If that happens, Azure Static Web Apps is the fallback (William knows Azure from eGOS).

## 3. What we deliberately do NOT need

- No separate backend server (Express/FastAPI) — Supabase + Next.js server actions cover everything
- No ORM (Prisma etc.) — `supabase-js` + generated types; fewer moving parts, RLS stays the security boundary
- No n8n / workflow engine, no Redis, no queues — if a scheduled job is ever needed (Sunday reminder), Vercel Cron or `pg_cron`, both free
- No native app, no app stores (locked 2) · no Garmin/Strava (locked 4)
- No analytics suite — entry timestamps in the DB already answer "who backfills"
- No component-library bloat — Tailwind + hand-rolled components matching the 06 mockups

## 4. Scale reality check (24 boys)

24 athletes × ~10 sessions/wk × 26 weeks ≈ **6k log rows/season** — the whole database stays single-digit MB. Every free tier here is overkill by 100×. There is no performance problem to engineer for. **All engineering effort goes to taps-to-log and coach-review speed, not scalability.** Code should be boring: small schema (~10 tables, 02 §1), server components by default, client components only where interactive (log form, day strip), RLS everywhere, soft deletes.

## 5. Pre-build setup checklist (~1 hour, do after coach says yes)

- [ ] GitHub private repo `hooslog`
- [ ] Supabase project (free tier) — RLS on from the first migration
- [ ] Vercel account linked to repo (Hobby)
- [ ] Resend account + domain-less sending for pilot
- [ ] VAPID key pair for web push
- [ ] *(Phase 2 only)* Anthropic API key — not before

## 6. Build order this implies (maps to 02 §4 timeline)

1. **Weekend 1:** repo + Supabase schema/RLS + auth + roster/groups seed
2. **Weekend 2:** coach plan builder (week grid, publish)
3. **Weekend 3:** athlete log PWA (the 06/07 flows, for real, with persistence)
4. **Weekend 4:** coach review queue + dashboard + CSV export + polish

Demo `07_portal_demo.html` remains throwaway — the real app starts clean from this stack. Nothing here gets built before the coach co-design session resolves 02 §6.
