"""Emit the per-symbol input bundles the Claude session feeds to subagents.

Reads routine/data/indicators-<date>.json + theses + cash from the local DB
and prints a JSON document with everything the routine needs in-memory:

  {
    "briefing_date": "...",
    "cash": 2996.42,
    "symbols": [
      {
        "symbol": "GOOGL",
        "holding": {...},
        "thesis": "..." | null,
        "indicator_snapshot": {...},
        "fundamentals_snapshot": {...},
        "news_summary": [...],
        "earnings_summary": {...},
        "day_change_pct": ...,
        "previous_close": ...
      },
      ...
    ]
  }

Writing this as a separate step keeps the Claude session's prompt clean
(`python load_context.py` returns one well-typed blob) and avoids each
agent re-reading raw files.
"""

from __future__ import annotations

import json
import sys

from common import db, load_env, snapshot_path


def main() -> int:
    load_env()
    conn = db()
    indicators_path = snapshot_path("indicators")
    with indicators_path.open() as f:
        indicators = json.load(f)

    by_symbol = {
        row["symbol"]: row["thesis_text"]
        for row in conn.execute("SELECT symbol, thesis_text FROM theses")
    }

    cash_row = conn.execute(
        "SELECT amount FROM cash_position WHERE id = 1"
    ).fetchone()
    cash = float(cash_row["amount"]) if cash_row else 0.0

    out = {
        "briefing_date": indicators["briefing_date"],
        "cash": cash,
        "symbols": [
            {**s, "thesis": by_symbol.get(s["symbol"])} for s in indicators["symbols"]
        ],
    }
    json.dump(out, sys.stdout, indent=2, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
