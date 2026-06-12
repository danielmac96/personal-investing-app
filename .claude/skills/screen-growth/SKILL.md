---
name: screen-growth
description: Run the weekly aggressive-growth opportunity screen on demand. Scans the curated universe, ranks survivors, and writes up to 3 proposals to the watchlist for approval.
---

# /screen-growth

Runs the same screen as the Sunday weekly routine, on demand.

## What it does

Executes `routine/weekly_screen.md` step-by-step. That prompt is the
authoritative source — read it before running.

1. `python routine/scripts/screen_universe.py` — hard filters over
   `routine/scripts/universe.py` (minus owned/watched).
2. Rank survivors with the `fundamentals-analyst` subagent.
3. Pick top 3, write `routine/data/proposals-<date>.json`.
4. `python routine/scripts/write_proposals.py <file>` — writes pending
   proposals for review on `/watchlist`.

## Pre-flight

- Deps installed: `pip install -r routine/requirements.txt`.
- The DB (`data/investing.db`) exists — created automatically on first
  script run.

## Notes

- This does NOT send email and does NOT auto-add to the watchlist —
  proposals are pending until the user approves them on the dashboard.
- To broaden/narrow the search, edit `routine/scripts/universe.py`.
- Expect 0–3 proposals. Zero is a valid, honest result on a frothy or
  flat week.
