"""Write the day's market data + briefing to the local SQLite DB atomically.

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
      "portfolio_doctor": {... arbitrary json ...},
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

Everything — prices, fundamentals, earnings, news, briefing, and the
recommendations replace — runs in one SQLite transaction, so a partial
failure never leaves the dashboard half-updated.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

from common import db, load_env, snapshot_path


def upsert_prices(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> int:
    conn.executemany(
        """INSERT INTO prices_eod (symbol, date, open, high, low, close, volume)
           VALUES (:symbol, :date, :open, :high, :low, :close, :volume)
           ON CONFLICT (symbol, date) DO UPDATE SET
             open = excluded.open, high = excluded.high, low = excluded.low,
             close = excluded.close, volume = excluded.volume""",
        rows,
    )
    return len(rows)


def upsert_fundamentals(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> int:
    conn.executemany(
        """INSERT INTO fundamentals_snapshot (symbol, snapshot_date, data)
           VALUES (?, ?, ?)
           ON CONFLICT (symbol, snapshot_date) DO UPDATE SET data = excluded.data""",
        [
            (r["symbol"], r["snapshot_date"], json.dumps(r["data"]))
            for r in rows
        ],
    )
    return len(rows)


def upsert_news(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    overrides_by_key: dict[tuple, str | None],
) -> int:
    if not rows:
        return 0
    params = []
    for r in rows:
        key = (r["symbol"], r.get("url"), r["published_at"])
        sentiment = overrides_by_key.get(key, r.get("sentiment"))
        params.append((
            r["symbol"],
            r["headline"],
            r.get("url") or "",  # '' keeps the UNIQUE key deduping url-less items
            r["published_at"],
            sentiment,
            r.get("source"),
        ))
    conn.executemany(
        """INSERT INTO news_items (symbol, headline, url, published_at, sentiment, source)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (symbol, url, published_at) DO UPDATE SET
             headline = excluded.headline,
             sentiment = coalesce(excluded.sentiment, news_items.sentiment),
             source = excluded.source""",
        params,
    )
    return len(params)


def upsert_earnings(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    conn.executemany(
        """INSERT INTO earnings_events
             (symbol, report_date, eps_estimate, eps_actual, surprise_pct)
           VALUES (:symbol, :report_date, :eps_estimate, :eps_actual, :surprise_pct)
           ON CONFLICT (symbol, report_date) DO UPDATE SET
             eps_estimate = excluded.eps_estimate,
             eps_actual = excluded.eps_actual,
             surprise_pct = excluded.surprise_pct""",
        [
            {
                "symbol": r["symbol"],
                "report_date": r["report_date"],
                "eps_estimate": r.get("eps_estimate"),
                "eps_actual": r.get("eps_actual"),
                "surprise_pct": r.get("surprise_pct"),
            }
            for r in rows
        ],
    )
    return len(rows)


def apply_briefing(
    conn: sqlite3.Connection,
    briefing_date: str,
    portfolio_summary: dict[str, Any],
    raw_payload: dict[str, Any],
    recommendations: list[dict[str, Any]],
) -> None:
    """Replace the briefing + recommendations for this date.

    Idempotent: a re-run on the same briefing_date fully replaces prior
    contents instead of duplicating recommendations.
    """
    conn.execute(
        "DELETE FROM recommendations WHERE briefing_date = ?", (briefing_date,)
    )
    conn.execute(
        "DELETE FROM daily_briefings WHERE briefing_date = ?", (briefing_date,)
    )
    conn.execute(
        """INSERT INTO daily_briefings (briefing_date, portfolio_summary, raw_payload)
           VALUES (?, ?, ?)""",
        (briefing_date, json.dumps(portfolio_summary), json.dumps(raw_payload)),
    )
    conn.executemany(
        """INSERT INTO recommendations
             (briefing_date, symbol, signal, confidence, reasoning,
              watch_items, thesis_status, indicator_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                briefing_date,
                r["symbol"],
                r["signal"],
                int(r["confidence"]),
                r["reasoning"],
                json.dumps(r.get("watch_items") or []),
                r.get("thesis_status") or None,
                json.dumps(r.get("indicator_snapshot"))
                if r.get("indicator_snapshot") is not None
                else None,
            )
            for r in recommendations
        ],
    )


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

    conn = db()
    with conn:  # one transaction for the whole briefing
        p = upsert_prices(conn, w["prices_eod"])
        f_ = upsert_fundamentals(conn, w["fundamentals_snapshot"])
        e = upsert_earnings(conn, w["earnings_events"])
        n = upsert_news(conn, w["news_items"], overrides_by_key)
        apply_briefing(
            conn,
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
