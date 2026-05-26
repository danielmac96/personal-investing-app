---
name: daily-brief
description: Manually run the daily briefing pipeline end to end — fetch yfinance, compute indicators, fan out to subagents, write to Supabase, send the email. Use to debug or to fire an off-schedule briefing.
---

# /daily-brief

Triggers the same routine that runs every weekday morning at 6:30 ET.

## What it does

Executes `routine/daily_briefing.md` step-by-step. That prompt is the
authoritative source of truth — read it before running this skill.

## Pre-flight check

Before invoking, confirm:

1. Required env vars are present: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_TO`.
2. Python deps installed: `pip install -r routine/requirements.txt`.
3. The user knows this will send an email — ask before sending if it's
   the second run today.

## Output

A single confirmation summary at the end with: briefing date,
recommendation count, top 3 watch items, and any non-fatal warnings.
Same as the scheduled run.
