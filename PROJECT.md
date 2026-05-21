# Claude Code Project Prompt: Personal Growth-Investor Dashboard

> **Paste everything below this line into a fresh Claude Code session as your opening prompt. Save as `PROJECT.md` in the repo root so Claude Code can reference it on every future session.**

-----

## 1. Project Goal

Build a **personal investing dashboard** with two halves:

1. **A deployed Next.js web app** (Vercel) backed by Supabase, showing my portfolio, end-of-day prices, technical signals, fundamentals, news, earnings calendar, and the latest AI-generated briefing. Mobile-friendly and functional — no fancy charts in v1.
1. **A Claude Code cloud routine** (`/schedule`) that runs every weekday at 6:30 AM ET, fetches market data via `yfinance`, performs the full analysis as a Claude Code session, writes the briefing directly to Supabase, and emails me a short summary. **The routine is the analyst — no Anthropic API calls anywhere in the app.**

**Investment profile:** aggressive growth, 15-year horizon. Bias toward secular-winner compounders, willing to hold concentrated positions and ride drawdowns, tolerant of higher valuations if growth justifies. Defensive / low-growth names get questioned aggressively. The dashboard makes me a disciplined long-term holder, flags thesis breaks and concentration drift, surfaces high-conviction opportunities — and otherwise tells me to sit on my hands.

**Hard rule:** every recommendation must include (a) a confidence rating 1–10, (b) reasoning citing specific indicators or facts, and (c) a visible "this is information, not financial advice" disclaimer. No naked buy/sell calls.

**Data model:** previous-day's close only in v1. No live/intraday prices. The routine writes once per weekday morning; the app reads what's there. Live prices can come later.

-----

## 2. Tech Stack (locked — keep everything free)

- **Frontend + API:** Next.js 14+ (App Router), TypeScript, Tailwind, shadcn/ui for primitives only (cards, tables, buttons, badges). **No charting library in v1.** Deploy on Vercel Hobby (free).
- **Database + Auth:** Supabase free tier — Postgres for data, Supabase Auth for the single-user login (allow-list my email), Row-Level Security on every table.
- **Market data:** `yfinance` (Python) **only inside the Claude Code cloud routine**. Not in the Next.js app.
- **AI:** **None inside the app.** All analysis happens in the cloud routine using my Pro/Max subscription quota.
- **Email:** Resend free tier, called from inside the routine after the Supabase write.
- **Scheduling:** Claude Code cloud routine via `/schedule`. No external cron service.
- **Schwab integration:** scaffold `lib/brokers/schwab.ts` with stub methods only. CSV upload is the primary import path in v1.

**Hard constraint:** total monthly marginal cost must remain $0. Vercel Hobby, Supabase free, Resend free, routine covered by Pro/Max. If a feature would push us off the free tier, defer it.

-----

## 3. Build in Phases — do not skip ahead

Commit each phase before starting the next. After each phase, summarize what's done, what's deferred, and what I need to do before continuing.

### Phase 1 — Skeleton, Supabase, CSV ingestion (MVP)

**Repo scaffold:** `/web` (Next.js app), `/routine` (Claude Code routine prompt + Python helper scripts), `/supabase` (SQL migrations + RLS policies), `/docs`.

**Supabase tables** (with RLS — only my user can read; service role writes):

- `holdings` (symbol, qty, cost_basis_per_share, notes, updated_at)
- `prices_eod` (symbol, date, open, high, low, close, volume) — daily-close only
- `fundamentals_snapshot` (symbol, snapshot_date, json blob of P/E, PEG, margins, growth rates, etc.)
- `news_items` (symbol, headline, url, published_at, sentiment, source)
- `earnings_events` (symbol, report_date, eps_estimate, eps_actual, surprise_pct)
- `daily_briefings` (briefing_date, portfolio_summary jsonb, raw_payload jsonb, created_at)
- `recommendations` (briefing_date, symbol, signal, confidence, reasoning, watch_items jsonb, thesis_status, indicator_snapshot jsonb)
- `watchlist` (symbol, added_at, notes)
- `theses` (symbol, thesis_text, updated_at)
- `cash_position` (amount, updated_at)

**Next.js pages (minimal, mobile-first):**

- `/login` — Supabase Auth magic link, restricted to my email.
- `/` — dashboard home: total value, day change %, top 3 watch items from today's briefing, holdings table (symbol, qty, last close, day change %, % of account, total return %). Plain text + badges, no charts.
- `/upload` — CSV upload accepting Schwab format (Symbol, Description, Qty, Mkt Val, % of Acct). Parses, upserts into `holdings`. Cost-basis entered separately.

**Concentration alerts** as inline badges on the holdings table: red when single position > 20%, amber > 15%, green otherwise. Sector concentration calculated and shown as a simple list, not a pie chart.

### Phase 2 — Per-stock detail page (still minimal UI)

`/stocks/[symbol]` with stacked sections, all text/table layout:

- **Header:** symbol, name, last close, day change %, % of account, my thesis (editable inline).
- **Indicator strip** (text + colored badges, no chart): SMA-50, SMA-200, price-vs-SMA-200, RSI(14), MACD histogram sign, distance to 52-week high, ATR(14). Each value followed by a one-word verdict badge: `bullish` / `neutral` / `bearish`.
- **Fundamentals table:** trailing P/E, forward P/E, PEG, P/S, EV/EBITDA, gross margin, operating margin, ROE, ROIC, FCF margin, net debt / EBITDA, revenue YoY, EPS YoY, 5-yr revenue CAGR, dividend yield, payout ratio. Each row shows current value + 5-yr range. No chart.
- **News list:** last 10 items, each with headline, source, published date, sentiment badge.
- **Earnings:** next report date, days until, consensus EPS, last 4 quarters of beats/misses as a small table.
- **Analyst targets:** mean target, recommendation rating, count of analysts.
- **Latest recommendation:** today's signal, confidence, reasoning paragraph, watch items, thesis status.

If you need a price visual, use a single tiny inline SVG sparkline (50 lines of code max). Skip otherwise.

### Phase 3 — The daily routine (the heart of the product)

Build two things:

**A. Supabase write path** — the routine uses Supabase's service-role key to write directly to `prices_eod`, `fundamentals_snapshot`, `news_items`, `earnings_events`, `daily_briefings`, `recommendations`. No Next.js webhook endpoint needed; the app just reads what's there. Wrap writes in a single transaction per briefing date so partial failures don't leave the dashboard half-updated.

**B. The Claude Code routine itself** — written as a prompt in `/routine/daily_briefing.md`, scheduled via `/schedule` for weekdays at 6:30 AM ET. The routine:

1. Clones this repo (handled by the cloud environment).
1. Runs `python routine/scripts/fetch_market_data.py` which pulls fresh yfinance data — previous day's OHLC, fundamentals via `Ticker.info`, recent news, earnings calendar — for every holding + watchlist symbol into local JSON.
1. Computes indicators (SMA-50, SMA-200, RSI-14, MACD, ATR-14, 52-week stats) in pandas. The routine never sends raw price history to Claude — only the precomputed indicator snapshot. Keeps token usage tight.
1. Reads my saved theses from Supabase.
1. Invokes the subagents (Section 4) in parallel where possible: per-stock analyst pass, portfolio-doctor pass, news-scanner pass.
1. Assembles the structured briefing JSON.
1. Writes everything to Supabase in one transaction.
1. Sends a < 200-word HTML email via Resend with day change, top 3 watch items, and per-symbol links to the dashboard.
1. Logs a confirmation summary.

The routine prompt should be deterministic and structured — no creative prose unless asked.

### Phase 4 — Opportunity scanner & options (additional routines)

- Watchlist CRUD on the dashboard.
- **Weekly screen routine** — separate `/schedule` task running Sundays at 8 AM ET. Scans a defined universe (SPY + QQQ + IBB + ARKK constituents, say) for aggressive-growth-quality combos: revenue YoY > 20%, gross margin > 50% OR revenue accel > 5pp, FCF positive OR clear path, RSI 40–65, above SMA-200. Writes 3 candidates with confidence ratings to a `watchlist_proposals` table. Surfaced on the dashboard for my approval.
- **Options ideas** added to the daily routine: for any holding > 5% of account, surface available covered-call strikes at ~30 delta, 30–45 DTE, annualized yield. For my highest-conviction names, surface LEAPS-call ideas (12–24 month, ~70 delta) as a leveraged-long alternative.

### Phase 5 — Hardening

- Supabase RLS policy review (only my user reads, service role writes, no public access).
- yfinance retry/backoff in the routine.
- Email failure handling — write a failure row to a `routine_runs` table so I can see when something didn't go out.
- PWA manifest for "Add to Home Screen."

-----

## 4. Subagents to Create

Commit to `.claude/agents/` so the cloud routine can invoke them. Each must return structured JSON with explicit confidence ratings.

- **`fundamentals-analyst`** — flags valuation extremes vs sector median and vs the stock's own 5-yr range; weights growth-rate sustainability over absolute valuation.
- **`technical-analyst`** — identifies setups (golden cross, MACD cross, RSI divergence, Bollinger squeeze) and trend strength from the precomputed indicator snapshot.
- **`news-scanner`** — classifies headline sentiment and surfaces material events (downgrade, lawsuit, guidance cut, exec departure, major product launch).
- **`options-strategist`** — for the aggressive-growth profile, leans toward LEAPS calls on highest-conviction names and covered calls on outsized positions; explicit strike/DTE/expected-return.
- **`thesis-checker`** — given my stored thesis + latest fundamentals + news, returns INTACT / STRAINED / BROKEN with reasoning.
- **`portfolio-doctor`** — flags concentration, sector imbalance, defensive-name drag in a growth account, tax-loss harvest candidates.

-----

## 5. Skills to Create

`.claude/skills/` for manual local runs:

- **`daily-brief`** — runs the full daily pipeline manually for debugging.
- **`research-ticker SYMBOL`** — unified deep dive: fundamentals + technical + news + thesis-check.
- **`screen-growth`** — runs the weekly opportunity screen on demand.
- **`tax-review`** — year-end realized gains/losses + harvest proposals.

-----

## 6. Analyst Profile Reference (15-year aggressive growth)

Send this canonical context block to every analysis subagent so they weigh factors correctly:

**Profile: aggressive growth, 15-year horizon. Tolerant of volatility and high valuations when growth justifies. Skeptical of defensive / slow-growth names.**

- **Growth (heaviest weight):** revenue YoY > 15% strong, > 25% excellent; revenue acceleration (sequential reaccel) is a major positive; 5-yr revenue CAGR > 15% preferred; EPS growth secondary to revenue growth in early-stage compounders.
- **Quality:** ROIC > 15% preferred but not required for hyper-growth names; gross margin > 50% is a strong signal; FCF positive or clear path within 2–3 years.
- **Trend & momentum:** price above SMA-200 = uptrend intact; SMA-50 > SMA-200 = confirmed uptrend; RSI(14) > 70 not auto-overbought in strong trends — watch for divergence, not absolute level; MACD histogram inflection on weekly is a stronger signal than daily.
- **Valuation:** PEG < 2 reasonable, < 1 cheap; P/S vs sector median matters more than P/E for high-growth names; EV/EBITDA vs the stock's own 5-yr range.
- **Catalysts:** earnings in the next 2 weeks → flag; recent guidance raises / analyst upgrades → positive; secular tailwind alignment (AI, cloud, fintech, GLP-1, security, etc.) → weight up.
- **Position sizing for this profile:**
  - Highest-conviction names can run up to 20% of account before trim discussion.
  - Any name < 1.5% of account → "build to 3%+ or sell — too small to matter."
  - Defensive low-growth holdings in a growth account get questioned aggressively; suggest reallocation if growth elsewhere is more attractive.

-----

## 7. Seed Portfolio

| Symbol | Qty     | % of Acct |
| ------ | ------- | --------- |
| GOOGL  | 20.1475 | 19.89%    |
| NVDA   | 22.0435 | 13.09%    |
| MCK    | 2       | 6.04%     |
| SPOT   | 3       | 4.95%     |
| SPY    | 2.0793  | 4.50%     |
| QQQ    | 2.0411  | 3.95%     |
| TSLA   | 3       | 3.85%     |
| JPM    | 4.1951  | 3.85%     |
| AAPL   | 4.046   | 3.36%     |
| COST   | 1.012   | 3.29%     |
| BRK/B  | 2       | 3.19%     |
| BLK    | 1.0503  | 3.16%     |
| TMUS   | 4.1622  | 2.90%     |
| AMZN   | 4       | 2.72%     |
| SCHW   | 8.2784  | 2.45%     |
| V      | 2.0376  | 2.03%     |
| PG     | 3.1767  | 1.55%     |
| KO     | 5.5001  | 1.39%     |
| CVS    | 5.4867  | 1.36%     |
| BA     | 2       | 1.33%     |
| NKE    | 4.1871  | 0.74%     |
| ETSY   | 4       | 0.67%     |
| Cash   | —       | 9.73%     |

Total ≈ $30,790 as of 2026-03-12. Use `BRK-B` for yfinance.

-----

## 8. Cloud Environment Setup for the Routine

At `claude.ai/code` configure the cloud environment with:

- Repo access to this project.
- Setup script that installs Python deps: `yfinance`, `pandas`, `pandas-ta`, `numpy`, `requests`, `supabase`, `python-dotenv`.
- Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_TO`.
- Network access enabled (yfinance, Supabase REST endpoints, Resend API).

Include `/routine/SETUP.md` with step-by-step instructions for me to wire this up in the Claude.ai UI.

-----

## 9. Success Criteria

This project is successful when:

1. I can open the app on my phone and see total value + day change + the morning briefing in under 3 seconds.
1. Every weekday at 6:30 AM ET a < 200-word email arrives; tapping any ticker opens the detail page.
1. Every recommendation has a confidence rating, reasoning, and a source-data snapshot in `recommendations.indicator_snapshot` I can audit later.
1. The CSV importer handles my real Schwab export with zero manual cleanup.
1. Marginal cost is **$0/month**. Anything that would change that gets surfaced for explicit approval first.
1. Routine daily-run cap and Pro/Max subscription quota stay comfortable with one weekday morning run + occasional manual triggers.

-----

## 10. Things You Should Push Back On

- Auto-executing trades. Never — read-only / advisory by design.
- High-frequency intraday alerts. Defeats the long-horizon point.
- Adding live-price polling in v1 — explicitly deferred.
- Adding chart libraries in v1 — explicitly deferred.
- Removing the disclaimer or confidence-rating requirement.
- Moving analysis back into the app with an API key — keep it in the routine.
- Any feature that pushes us off a free tier without explicit approval.

-----

## 11. Your First Response

Don't write code yet. First, respond with:

1. A one-page Phase 1 implementation plan: file tree, Supabase migrations, Next.js routes/pages, CSV parser strategy.
1. A checklist of what I need to do before you can proceed: create Supabase project (free tier), create Resend account, generate the service-role key, generate the `EMAIL_TO` value, set up the Claude Code cloud environment for routines.
1. Any questions where my prompt is ambiguous or where you'd recommend a different choice.

Then wait for my go-ahead.
