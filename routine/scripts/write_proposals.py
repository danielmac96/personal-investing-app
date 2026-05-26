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

Calls apply_screen_proposals(proposed_date, proposals) which replaces only
the still-pending rows for that date — approved/dismissed proposals are
never clobbered.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from common import briefing_date_str, load_env, supabase_client


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

    client = supabase_client()
    client.rpc(
        "apply_screen_proposals",
        {"_proposed_date": proposed_date, "_proposals": proposals},
    ).execute()

    print(
        json.dumps(
            {"proposed_date": proposed_date, "proposals_written": len(proposals)},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
