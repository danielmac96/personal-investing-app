# Weekly Growth Screen — Claude Code Cloud Routine Prompt

> **How to use:** create a second `/schedule` task pointing at this repo,
> Sundays 08:00 ET (`0 8 * * 0` in America/New_York), same environment as
> the daily briefing. Paste the body of this file as the prompt. See
> `routine/SETUP.md`.

---

You run the weekly opportunity screen for a 15-year aggressive-growth
investor. See `.claude/agents/_profile.md` for the canonical profile.

**Hard rules**
1. Output exactly 3 candidates (or fewer if fewer than 3 pass the screen).
2. Every candidate has a 1–10 confidence integer and reasoning citing the
   specific screen metrics.
3. Never propose a name the user already holds or watches — the screener
   already excludes those, but double-check.
4. Proposals are suggestions for the user's approval, not auto-adds.
   Information, not financial advice.

---

## Step 1 — Run the screener

```
python routine/scripts/screen_universe.py
```

Scans `routine/scripts/universe.py` (minus owned/watched names) against the
hard filters: revenue YoY > 20%, gross margin > 50%, FCF positive, RSI in
[40, 65], price > SMA-200. Output: `routine/data/screen-<date>.json` with a
`passed` array, each entry carrying `metrics`.

If zero names pass, write an empty proposal set (step 4 with `[]`) and stop
— don't lower the bar to manufacture candidates.

## Step 2 — Rank the survivors

Read the `passed` array. For each survivor, invoke the
`fundamentals-analyst` subagent with its metrics + the profile context to
get a score and a read on growth durability and valuation. Run these in
parallel.

You may also eyeball the qualitative criteria the hard filter can't compute:
- revenue **acceleration** (is growth reaccelerating vs decelerating?)
- a **clear path to FCF** for names that are FCF-negative but were excluded
  — note: the hard filter already required FCF > 0, so survivors are
  FCF-positive; use this judgment only if you choose to manually reconsider
  a near-miss.

## Step 3 — Pick the top 3

Select the 3 highest-conviction names. For each, assemble:

```json
{
  "symbol": "CRWD",
  "confidence": 8,
  "reasoning": "One paragraph citing revenue YoY, gross margin, RSI, trend, and the secular theme.",
  "screen_metrics": { ...the metrics object from the screener for this symbol... }
}
```

Write the array to `routine/data/proposals-<date>.json`:

```json
{ "proposed_date": "YYYY-MM-DD", "proposals": [ ...up to 3... ] }
```

Validate: each `confidence` is an integer 1–10; each `symbol` is in the
screener's `passed` set; length ≤ 3.

## Step 4 — Write proposals

```
python routine/scripts/write_proposals.py routine/data/proposals-<date>.json
```

This calls `apply_screen_proposals`, which replaces only still-pending
proposals for today — it never overwrites ones the user already approved or
dismissed. Idempotent.

## Step 5 — Confirmation summary

End with a single message: screen date, count evaluated, count passed,
and the 3 proposals (symbol + confidence + one-line reason). No email for
the weekly screen — the user reviews proposals on the dashboard's
`/watchlist` page.

Do NOT push to git. Do NOT modify code. Only read the repo and write JSON
under `routine/data/`.
