# Cloud Routine Setup

How to wire up the daily briefing in claude.ai/code so it runs every
weekday at 6:30 AM ET.

## 1. Prerequisites you need before starting

| Item | Where to get it |
| ---- | --------------- |
| `SUPABASE_URL` | `https://mmufhnhqpjrjxaghwdiq.supabase.co` (already known) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → service_role |
| `RESEND_API_KEY` | resend.com → API Keys → create a "send only" key |
| `EMAIL_TO` | `danielmac96@gmail.com` (or wherever you want the briefing sent) |
| `EMAIL_FROM` | Either `onboarding@resend.dev` (sandbox, works without a verified domain) or `briefing@yourdomain.com` once you verify a domain in Resend |
| `NEXT_PUBLIC_SITE_URL` | Production app URL — used to build links in the email body (e.g. `https://your-app.vercel.app`) |

**Resend sandbox caveat:** `onboarding@resend.dev` can only deliver to
the address you signed up with. To send to anything else you need to
verify a domain. For a personal briefing to yourself, the sandbox is
fine.

## 2. Create the cloud environment

In claude.ai/code:

1. Open **Settings → Environments → Create environment**.
2. **Repository:** `danielmac96/personal-investing-app`.
3. **Network policy:** "Allow outbound network access" — yfinance,
   Supabase REST, and Resend all need it.
4. **Setup script** (runs on every container start):

   ```bash
   pip install --quiet -r routine/requirements.txt
   ```

5. **Environment variables** — paste in the five values from §1
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `EMAIL_TO`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`).

## 3. Smoke-test once, manually

Start a fresh session in the environment and run, in order:

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

## 4. Run the full briefing manually

Once the scripts work, drive the full routine by pasting the body of
`routine/daily_briefing.md` as the session prompt and letting it run.
This will:
- fan out to all subagents,
- write to Supabase via `apply_briefing`,
- send a real email.

Check:
- `daily_briefings` has a row for today on the dashboard.
- `recommendations` has one row per holding + watchlist symbol.
- The email arrived at `EMAIL_TO`.

## 5. Schedule it

Once a manual run is clean:

1. Settings → Scheduled tasks → Create.
2. **Schedule:** `30 6 * * 1-5` in **America/New_York**.
3. **Environment:** the one you created above.
4. **Prompt:** literal copy of `routine/daily_briefing.md`.
5. Save.

The scheduler runs the prompt in a fresh ephemeral container each
weekday morning. Output (the confirmation summary at step 11) is
visible in the schedule history.

## 6. Stopping or pausing

Pause the scheduled task from the same screen. The Supabase data
persists; the next time the routine runs it simply writes a new
`daily_briefings` row for that date.

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Empty `prices_eod` after run | yfinance returned no rows for a symbol | Check `routine/data/raw-<date>.json` for `"history_error"` on that symbol |
| `apply_briefing: must be a JSON array` | Routine wrote malformed `recommendations` | Inspect `routine/data/briefing-<date>.json`; re-run step 8 |
| Resend 422 "invalid `to`" | Sandbox sender + non-signup recipient | Verify a domain or switch `EMAIL_TO` to your Resend account email |
| Routine ran but dashboard shows no briefing | RLS issue — service_role key wrong or rotated | Reset the env var to the current service_role key |
| Cost > $0 anywhere | Should not happen. Stop the routine and check Vercel + Supabase usage; both should be inside free tier with this workload |
