"""Upsert the day's writeables, then call apply_briefing() atomically.

Reads:
  * routine/data/indicators-<date>.json  (from compute_indicators.py)
  * routine/data/briefing-<date>.json    (assembled by the Claude session)

The briefing JSON shape (matches lib/snapshots.ts and the
LatestRecommendationCard contract):

  {
    "briefing_date": "YYYY-MM-DD",
    "portfolio_summary": {
      "equity_value": ...,
      "cash": ...,
      "total_value": ...,
      "day_change_value": ...,
      "day_change_pct": ...,
      "top_watch_items": [
        {"symbol": "...", "signal": "...", "confidence": 1-10, "reasoning": "..."},
        ...
      ],
      "portfolio_doctor": {... arbitrary jsonb ...},
      "profile_notes": "optional one-liner"
    },
    "raw_payload": {... arbitrary, kept for audit ...},
    "recommendations": [
      {
        "symbol": "...",
        "signal": "BUY|HOLD|TRIM|SELL|WATCH|SIT",
        "confidence": 1-10,
        "reasoning": "...",
        "watch_items": ["..."],
        "thesis_status": "INTACT|STRAINED|BROKEN" | null,
        "indicator_snapshot": { ... matches IndicatorSnapshot ... }
      }
    ],
    "news_overrides": [   # optional: enriched sentiments from news-scanner
      {"symbol": "...", "url": "...", "published_at": "...", "sentiment": "..."}
    ]
  }
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from common import load_env, snapshot_path, supabase_client

CHUNK = 200  # postgrest upsert size — keep payloads modest


def chunked(seq, size=CHUNK):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def upsert_prices(client, rows: list[dict[str, Any]]) -> int:
    n = 0
    for chunk in chunked(rows):
        client.table("prices_eod").upsert(chunk, on_conflict="symbol,date").execute()
        n += len(chunk)
    return n


def upsert_fundamentals(client, rows: list[dict[str, Any]]) -> int:
    n = 0
    for chunk in chunked(rows):
        client.table("fundamentals_snapshot").upsert(
            chunk, on_conflict="symbol,snapshot_date"
        ).execute()
        n += len(chunk)
    return n


def upsert_news(client, rows: list[dict[str, Any]], overrides_by_key: dict[tuple, str | None]) -> int:
    if not rows:
        return 0
    enriched = []
    for r in rows:
        key = (r["symbol"], r.get("url"), r["published_at"])
        if key in overrides_by_key:
            r = {**r, "sentiment": overrides_by_key[key]}
        enriched.append(r)
    n = 0
    for chunk in chunked(enriched):
        client.table("news_items").upsert(
            chunk, on_conflict="symbol,url,published_at"
        ).execute()
        n += len(chunk)
    return n


def upsert_earnings(client, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    # Earnings rows arrive once per symbol/date; merging both upcoming +
    # history into a single upsert is fine because the PK matches.
    n = 0
    for chunk in chunked(rows):
        client.table("earnings_events").upsert(
            chunk, on_conflict="symbol,report_date"
        ).execute()
        n += len(chunk)
    return n


def apply_briefing(
    client,
    briefing_date: str,
    portfolio_summary: dict[str, Any],
    raw_payload: dict[str, Any],
    recommendations: list[dict[str, Any]],
) -> None:
    client.rpc(
        "apply_briefing",
        {
            "_briefing_date": briefing_date,
            "_portfolio_summary": portfolio_summary,
            "_raw_payload": raw_payload,
            "_recommendations": recommendations,
        },
    ).execute()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: write_briefing.py <briefing.json>", file=sys.stderr)
        return 2
    load_env()
    briefing_path = Path(sys.argv[1])
    with briefing_path.open() as f:
        briefing = json.load(f)

    briefing_date = briefing["briefing_date"]
    indicators_path = snapshot_path("indicators", briefing_date)
    with indicators_path.open() as f:
        indicators = json.load(f)

    w = indicators["writeables"]

    # Build a lookup of news sentiment overrides, keyed by (symbol, url, published_at).
    overrides_by_key: dict[tuple, str | None] = {}
    for o in briefing.get("news_overrides") or []:
        key = (o["symbol"], o.get("url"), o["published_at"])
        overrides_by_key[key] = o.get("sentiment")

    client = supabase_client()

    p = upsert_prices(client, w["prices_eod"])
    f_ = upsert_fundamentals(client, w["fundamentals_snapshot"])
    e = upsert_earnings(client, w["earnings_events"])
    n = upsert_news(client, w["news_items"], overrides_by_key)

    apply_briefing(
        client,
        briefing_date=briefing_date,
        portfolio_summary=briefing["portfolio_summary"],
        raw_payload=briefing.get("raw_payload") or {},
        recommendations=briefing["recommendations"],
    )

    summary = {
        "briefing_date": briefing_date,
        "prices_upserted": p,
        "fundamentals_upserted": f_,
        "earnings_upserted": e,
        "news_upserted": n,
        "recommendations": len(briefing["recommendations"]),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
