"""Create the local SQLite DB and optionally seed it with the starter portfolio.

Usage:
  python routine/scripts/init_db.py           # create/upgrade schema only
  python routine/scripts/init_db.py --seed    # also load the PROJECT.md §7 portfolio

Seeding only fills empty tables — it never overwrites holdings or cash you've
already imported via the dashboard's CSV upload.
"""

from __future__ import annotations

import argparse
import sys

from common import db, load_env

# PROJECT.md §7 seed portfolio (BRK/B normalised to BRK-B for yfinance).
SEED_HOLDINGS: list[tuple[str, float]] = [
    ("GOOGL", 20.1475),
    ("NVDA", 22.0435),
    ("MCK", 2),
    ("SPOT", 3),
    ("SPY", 2.0793),
    ("QQQ", 2.0411),
    ("TSLA", 3),
    ("JPM", 4.1951),
    ("AAPL", 4.046),
    ("COST", 1.012),
    ("BRK-B", 2),
    ("BLK", 1.0503),
    ("TMUS", 4.1622),
    ("AMZN", 4),
    ("SCHW", 8.2784),
    ("V", 2.0376),
    ("PG", 3.1767),
    ("KO", 5.5001),
    ("CVS", 5.4867),
    ("BA", 2),
    ("NKE", 4.1871),
    ("ETSY", 4),
]

SEED_CASH = 2995.87  # 9.73% of ≈ $30,790


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="seed the starter portfolio")
    args = parser.parse_args()

    load_env()
    conn = db()  # opening applies the schema

    if args.seed:
        existing = conn.execute("SELECT count(*) AS n FROM holdings").fetchone()["n"]
        if existing > 0:
            print(f"holdings already has {existing} rows — skipping seed")
        else:
            with conn:
                conn.executemany(
                    "INSERT INTO holdings (symbol, qty) VALUES (?, ?)",
                    SEED_HOLDINGS,
                )
                conn.execute(
                    """INSERT INTO cash_position (id, amount) VALUES (1, ?)
                       ON CONFLICT (id) DO NOTHING""",
                    (SEED_CASH,),
                )
            print(f"seeded {len(SEED_HOLDINGS)} holdings + ${SEED_CASH:,.2f} cash")

    tables = [
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    print(f"database ready ({len(tables)} tables): {', '.join(tables)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
