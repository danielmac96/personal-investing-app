"""Write the weekly screen's top picks to watchlist_proposals (atomic).

Input JSON (assembled by the weekly_screen.md routine) — an array of up to 3:

  [
    {
      "symbol": "CRWD",
      "confidence": 8,
      "reasoning": "Revenue +33% YoY, 78% gross margin, FCF positive, RSI 54, above SMA-200. Security secular tailwind.",
      "screen_metrics": { "revenue_yoy": 0.33, "gross_margin": 0.78, "rsi_14": 54.0, ... }
    },
    ...
  ]

Replaces only the still-pending rows for that date — approved/dismissed
proposals are never clobbered.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from common import briefing_date_str, db, load_env


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: write_proposals.py <proposals.json>", file=sys.stderr)
        return 2
    load_env()
    path = Path(sys.argv[1])
    with path.open() as f:
        payload = json.load(f)

    if isinstance(payload, dict):
        proposed_date = payload.get("proposed_date") or briefing_date_str()
        proposals = payload.get("proposals") or []
    else:
        proposed_date = briefing_date_str()
        proposals = payload

    if not isinstance(proposals, list):
        print("proposals must be a JSON array", file=sys.stderr)
        return 2

    conn = db()
    with conn:
        # Replace only still-pending rows for this date; never clobber a
        # proposal the user already approved or dismissed.
        conn.execute(
            "DELETE FROM watchlist_proposals WHERE proposed_date = ? AND status = 'pending'",
            (proposed_date,),
        )
        conn.executemany(
            """INSERT INTO watchlist_proposals
                 (symbol, proposed_date, screen_metrics, confidence, reasoning, status)
               VALUES (?, ?, ?, ?, ?, 'pending')
               ON CONFLICT (symbol, proposed_date) DO UPDATE SET
                 screen_metrics = excluded.screen_metrics,
                 confidence     = excluded.confidence,
                 reasoning      = excluded.reasoning
               WHERE watchlist_proposals.status = 'pending'""",
            [
                (
                    p["symbol"],
                    proposed_date,
                    json.dumps(p.get("screen_metrics"))
                    if p.get("screen_metrics") is not None
                    else None,
                    int(p["confidence"]) if p.get("confidence") is not None else None,
                    p.get("reasoning"),
                )
                for p in proposals
            ],
        )

    print(
        json.dumps(
            {"proposed_date": proposed_date, "proposals_written": len(proposals)},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
