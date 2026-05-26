# Daily Routine

The morning briefing pipeline. Runs every weekday at 6:30 AM ET in a
Claude Code cloud routine; the same scripts can be run manually for
research or debugging.

```
routine/
├── daily_briefing.md       # the daily cloud-routine prompt (weekdays 6:30 ET)
├── weekly_screen.md        # the weekly cloud-routine prompt (Sundays 8:00 ET)
├── SETUP.md                # how to wire up the cloud environment
├── requirements.txt        # python deps (yfinance, pandas, supabase)
└── scripts/
    ├── common.py           # supabase client + env helpers
    ├── fetch_market_data.py  # yfinance → routine/data/raw-<date>.json
    ├── compute_indicators.py # → routine/data/indicators-<date>.json
    ├── load_context.py     # joins theses + cash; emits the agent input bundle
    ├── fetch_options.py    # option chains for eligible holdings (daily)
    ├── write_briefing.py   # upserts + atomic apply_briefing()
    ├── send_email.py       # < 200-word Resend HTML email
    ├── universe.py         # curated screening universe (weekly)
    ├── screen_universe.py  # hard-filter growth screen → screen-<date>.json
    └── write_proposals.py  # atomic apply_screen_proposals()
```

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
write_briefing.py      →   upserts + apply_briefing RPC
        │
        ▼
send_email.py          →   Resend
```

## Local dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # if you keep one; otherwise export vars
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
python scripts/fetch_market_data.py
python scripts/compute_indicators.py
python scripts/load_context.py
```

Output JSON files land under `routine/data/`, which is gitignored.

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

| Routine | Prompt | Schedule (America/New_York) | Writes |
| ------- | ------ | --------------------------- | ------ |
| Daily briefing | `daily_briefing.md` | `30 6 * * 1-5` | prices, fundamentals, news, earnings, daily_briefings, recommendations, options_ideas |
| Weekly screen | `weekly_screen.md` | `0 8 * * 0` | watchlist_proposals (pending) |
