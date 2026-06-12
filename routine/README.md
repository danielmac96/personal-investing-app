# Daily Routine

The morning briefing pipeline. Runs on your machine — scheduled via
cron + headless Claude Code, or manually with `/daily-brief`. All
writes go to the local SQLite DB (`data/investing.db`) that the web app
reads.

```
routine/
├── daily_briefing.md       # the daily routine prompt (weekdays 6:30)
├── weekly_screen.md        # the weekly screen prompt (Sundays 8:00)
├── SETUP.md                # local setup + scheduling
├── requirements.txt        # python deps (yfinance, pandas)
└── scripts/
    ├── common.py           # sqlite connection + env helpers
    ├── init_db.py          # create schema, optional --seed portfolio
    ├── fetch_market_data.py  # yfinance → routine/data/raw-<date>.json
    ├── compute_indicators.py # → routine/data/indicators-<date>.json
    ├── load_context.py     # joins theses + cash; emits the agent input bundle
    ├── fetch_options.py    # option chains for eligible holdings (daily)
    ├── write_briefing.py   # one-transaction write of the whole briefing
    ├── send_email.py       # < 200-word Resend HTML email
    ├── universe.py         # curated screening universe (weekly)
    ├── screen_universe.py  # hard-filter growth screen → screen-<date>.json
    ├── write_proposals.py  # atomic pending-proposals replace
    └── record_run.py       # write a routine_runs heartbeat row
```

`common.py` also provides `retry()` (exponential backoff for flaky
yfinance calls) and `record_run()` (best-effort routine_runs logging).
`send_email.py` records a routine_runs row on every send — success or
failure — so an undelivered briefing is always visible on the dashboard.

## Pipeline at a glance

```
fetch_market_data.py   →   raw-<date>.json
        │
        ▼
compute_indicators.py  →   indicators-<date>.json   (+ writeables)
        │
        ▼
load_context.py        →   context-<date>.json      (adds theses + cash)
        │
        ▼
[Claude session fans out to subagents:
   news-scanner, fundamentals-analyst,
   technical-analyst, thesis-checker,
   portfolio-doctor]
        │
        ▼
briefing-<date>.json   (assembled in-session)
        │
        ▼
write_briefing.py      →   data/investing.db (single transaction)
        │
        ▼
send_email.py          →   Resend
```

## Local dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py --seed   # first time only
python scripts/fetch_market_data.py
python scripts/compute_indicators.py
python scripts/load_context.py
```

Output JSON files land under `routine/data/`, which is gitignored. The
DB lives at `data/investing.db` (override with `INVESTING_DB_PATH`).

## Subagents

Defined in `.claude/agents/`. Profile reference lives in
`.claude/agents/_profile.md`. All six are now in use:
`fundamentals-analyst`, `technical-analyst`, `news-scanner`,
`thesis-checker`, `portfolio-doctor` (daily); `options-strategist`
(daily, eligible holdings); `fundamentals-analyst` again ranks the
weekly screen.

## Skills

- `/daily-brief` — manually run the full daily pipeline.
- `/research-ticker SYMBOL` — one-symbol deep dive, no writes.
- `/screen-growth` — run the weekly opportunity screen on demand.

Defined in `.claude/skills/`.

## Two scheduled routines

| Routine | Prompt | Schedule (local time) | Writes |
| ------- | ------ | --------------------- | ------ |
| Daily briefing | `daily_briefing.md` | `30 6 * * 1-5` | prices, fundamentals, news, earnings, daily_briefings, recommendations, options_ideas |
| Weekly screen | `weekly_screen.md` | `0 8 * * 0` | watchlist_proposals (pending) |
