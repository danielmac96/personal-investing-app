# Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│  Claude Code cloud   │         │  Schwab CSV (manual) │
│  routine (weekday    │         │                      │
│  6:30 AM ET)         │         │  uploaded via /upload│
│                      │         │                      │
│  yfinance ──► pandas │         └──────────┬───────────┘
│  indicators ──► sub‑ │                    │
│  agents ──► briefing │                    ▼
└──────────┬───────────┘          ┌──────────────────────┐
           │ service-role         │  Next.js App Router  │
           │ writes               │  on Vercel (Hobby)   │
           ▼                      │                      │
   ┌──────────────────────────────┴───────┐              │
   │           Supabase (Postgres + RLS)  │◄─ user reads ┘
   │  prices_eod, fundamentals_snapshot,  │   (anon JWT,
   │  news_items, earnings_events,        │    RLS gated
   │  daily_briefings, recommendations,   │    by email
   │  holdings, watchlist, theses,        │    allow-list)
   │  cash_position                       │
   └──────────────────────────────────────┘
                       │
                       ▼
               ┌──────────────┐
               │   Resend     │ < 200-word summary email
               └──────────────┘
```

## Boundary rules

- **App never calls Anthropic, never calls yfinance.** Pure read of Supabase
  data + thin user-write paths.
- **Routine never serves HTTP.** It runs, writes, emails, exits.
- **RLS is the security boundary**, not the middleware. Middleware redirects
  unauthenticated users for UX; RLS keeps the data safe even if middleware is
  bypassed.

## Phase 1 surface

- `/login`, `/`, `/upload` only.
- The dashboard reads from `holdings`, `cash_position`, and (when populated)
  `prices_eod` + `daily_briefings`. Until the routine runs (Phase 3), the
  dashboard shows holdings + cash with no last-close/day-change data — that's
  expected.
