# Routine Setup (local)

Everything — the dashboard, the database, and the daily briefing — runs
on your own machine. The database is a single SQLite file at
`data/investing.db`; the routine writes it and the Next.js app reads it.
No cloud services are required except Resend for the morning email.

## 1. One-time setup

```bash
# Python deps for the routine
python -m venv .venv && source .venv/bin/activate
pip install -r routine/requirements.txt

# Create the DB (and optionally seed the starter portfolio)
python routine/scripts/init_db.py --seed

# Web app
cd web && pnpm install && pnpm dev   # http://localhost:3000
```

Create a `.env` at the repo root for the email step:

| Var | Value |
| --- | ----- |
| `RESEND_API_KEY` | resend.com → API Keys → create a "send only" key |
| `EMAIL_TO` | `danielmac96@gmail.com` (or wherever the briefing should go) |
| `EMAIL_FROM` | `onboarding@resend.dev` (sandbox) or `briefing@yourdomain.com` once you verify a domain |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (used for links in the email body) |
| `INVESTING_DB_PATH` | optional — only if the DB lives somewhere other than `data/investing.db` |

**Resend sandbox caveat:** `onboarding@resend.dev` can only deliver to
the address you signed up with. For a personal briefing to yourself,
the sandbox is fine.

## 2. Smoke-test the pipeline

```bash
python routine/scripts/fetch_market_data.py
python routine/scripts/compute_indicators.py
python routine/scripts/load_context.py | head -50
```

Confirm:
- `routine/data/raw-<today>.json` exists and contains your symbols.
- `routine/data/indicators-<today>.json` has populated
  `indicator_snapshot` and `fundamentals_snapshot` for most symbols
  (ETFs may have mostly-null fundamentals — expected).
- The context output shows your cash position and any saved theses.

If yfinance throttles you, wait 5 minutes and retry. The script pauses
0.4s between symbols, but Yahoo rate-limits are inconsistent.

## 3. Run the full briefing manually

In a Claude Code session at the repo root, run `/daily-brief` (or paste
the body of `routine/daily_briefing.md` as the prompt). This will:
- fetch market data and compute indicators,
- fan out to all subagents,
- write the briefing to `data/investing.db` in one transaction,
- send the morning email.

Check:
- The dashboard home shows today's briefing and top watch items.
- Each holding's detail page has a recommendation with confidence +
  reasoning.
- The email arrived at `EMAIL_TO`.

## 4. Schedule it

The routine has to run on the machine that holds `data/investing.db`,
so schedule it locally. Two options:

**Cron + headless Claude Code** (recommended):

```cron
# weekdays 6:30 AM local time
30 6 * * 1-5  cd /path/to/personal-investing-app && claude -p "$(cat routine/daily_briefing.md)" --permission-mode acceptEdits >> routine/cron.log 2>&1
# Sundays 8:00 AM — weekly growth screen
0 8 * * 0     cd /path/to/personal-investing-app && claude -p "$(cat routine/weekly_screen.md)" --permission-mode acceptEdits >> routine/cron.log 2>&1
```

**Manual:** run `/daily-brief` over coffee. The dashboard's run-status
banner shows when the last run failed or the email didn't go out, so a
missed morning is visible at a glance.

The weekly screen writes up to 3 `watchlist_proposals` (status
`pending`). Review them on `/watchlist` — approve to add to the
watchlist, or dismiss. No email is sent for the screen.

## 5. Backups

The whole portfolio lives in one file. Copy it occasionally:

```bash
cp data/investing.db ~/Backups/investing-$(date +%F).db
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Empty `prices_eod` after run | yfinance returned no rows for a symbol | Check `routine/data/raw-<date>.json` for `"history_error"` on that symbol |
| `KeyError: 'writeables'` in write_briefing | compute_indicators didn't run for today | Re-run steps in order; file names are date-stamped |
| Resend 422 "invalid `to`" | Sandbox sender + non-signup recipient | Verify a domain or switch `EMAIL_TO` to your Resend account email |
| Dashboard empty after a run | App and routine pointing at different DB files | Make sure `INVESTING_DB_PATH` (if set) matches in both, or unset it everywhere |
| `database is locked` | Briefing write raced a dashboard read | Harmless — SQLite is in WAL mode and the writer retries within its 30s timeout; re-run if it actually failed |
