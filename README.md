# personal-investing-app

A personal investing dashboard. See [`PROJECT.md`](./PROJECT.md) for the full
spec and roadmap. (One amendment to the original spec: the stack uses a
**local SQLite database** — `data/investing.db` — instead of Supabase, and
runs entirely on your own machine. No cloud database, no auth, no hosting.)

## Layout

```
web/        Next.js 14 dashboard (reads the local DB via better-sqlite3)
db/         schema.sql — single source of truth, applied automatically
routine/    Daily briefing + weekly screen (Python + Claude Code subagents)
docs/       Architecture notes
data/       investing.db lives here (gitignored)
```

## Quick start

```bash
# 1. Python deps + database
python -m venv .venv && source .venv/bin/activate
pip install -r routine/requirements.txt
python routine/scripts/init_db.py --seed   # creates data/investing.db

# 2. Web app
cd web
pnpm install
cp .env.local.example .env.local   # defaults are fine
pnpm dev
```

Open http://localhost:3000. To run the morning briefing (data fetch,
analysis, email), see [`routine/SETUP.md`](./routine/SETUP.md) or run
`/daily-brief` in a Claude Code session.

## Disclaimer

This software displays information for personal use only. It is not financial
advice.
