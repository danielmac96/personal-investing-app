---
name: research-ticker
description: Deep-dive a single symbol — fundamentals + technical + news + thesis check, all in one report. Pass the ticker as an argument, e.g. /research-ticker NVDA.
---

# /research-ticker SYMBOL

One-symbol analyst run. Unlike `/daily-brief`, this skill does NOT
write to Supabase or send email — it's for ad-hoc research.

## Steps

1. Normalise the symbol (uppercase, `.` / `/` → `-`). Reject anything
   that doesn't match `^[A-Z][A-Z0-9.-]{0,11}$`.

2. Fetch fresh data for just this symbol:

   ```python
   from routine.scripts.fetch_market_data import fetch_symbol
   data = fetch_symbol("NVDA")
   ```

   Or run the full pipeline if recent data isn't on disk:

   ```
   python routine/scripts/fetch_market_data.py
   python routine/scripts/compute_indicators.py
   ```

3. Read the symbol's entry from
   `routine/data/indicators-<today>.json`.

4. Fetch the user's saved thesis from Supabase via
   `python routine/scripts/load_context.py | jq '.symbols[] | select(.symbol=="NVDA")'`

5. Invoke in parallel:
   - `fundamentals-analyst`
   - `technical-analyst`
   - `thesis-checker` (if a thesis exists)

6. (Optional) `news-scanner` on just this symbol's recent news.

7. Print a human-readable report with:
   - Header: symbol, last close, day change, % of account.
   - Fundamentals analyst output (signal, score, reasoning, watch items).
   - Technical analyst output (same shape).
   - Thesis status (or "no thesis on file").
   - Recent material news (from news-scanner).
   - A one-paragraph synthesis with the same signal vocabulary used by
     the daily routine.

Do NOT write anything to Supabase. Do NOT send an email.

## Argument handling

`SYMBOL` is the one required arg. If missing, ask the user which ticker
to research.
