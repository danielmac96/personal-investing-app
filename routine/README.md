# Daily Routine

The morning briefing pipeline. Runs every weekday at 6:30 AM ET in a
Claude Code cloud routine; the same scripts can be run manually for
research or debugging.

```
routine/
├── daily_briefing.md       # the cloud-routine prompt itself
├── SETUP.md                # how to wire up the cloud environment
├── requirements.txt        # python deps (yfinance, pandas, supabase)
└── scripts/
    ├── common.py           # supabase client + env helpers
    ├── fetch_market_data.py  # yfinance → routine/data/raw-<date>.json
    ├── compute_indicators.py # → routine/data/indicators-<date>.json
    ├── load_context.py     # joins theses + cash; emits the agent input bundle
    ├── write_briefing.py   # upserts + atomic apply_briefing()
    └── send_email.py       # < 200-word Resend HTML email
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
`.claude/agents/_profile.md`. The `options-strategist` agent exists but
isn't invoked yet (Phase 4).

## Skills

- `/daily-brief` — manually run the full pipeline.
- `/research-ticker SYMBOL` — one-symbol deep dive, no writes.

Defined in `.claude/skills/`.
