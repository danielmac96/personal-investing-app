"""Weekly growth screen.

Scans the curated universe (universe.py, minus what the user already holds /
watches) for aggressive-growth-quality combos:

  * revenue YoY      > 20%
  * gross margin     > 50%       (proxy for the "gross margin > 50% OR revenue
                                  accel > 5pp" rule — accel needs a quarterly
                                  sequence the Ticker.info blob doesn't carry,
                                  so the analyst agent judges accel/path
                                  qualitatively in the next step)
  * free cash flow   > 0         (proxy for "FCF positive OR clear path")
  * RSI(14)          in [40, 65]
  * price            > SMA-200

Symbols passing ALL hard filters are written to
routine/data/screen-<date>.json with their metrics. The weekly_screen.md
routine then hands these to the analyst to pick the top 3 with confidence
ratings and reasoning, and writes proposals via write_proposals.py.

Reuses indicator math from compute_indicators.py to stay consistent with the
daily routine.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

import yfinance as yf  # type: ignore[import-untyped]

from common import briefing_date_str, db, load_env, retry, snapshot_path
from compute_indicators import _f, indicator_snapshot
from fetch_market_data import serialise_history
from universe import screen_universe

PAUSE_SEC = 0.4

# Hard filter thresholds
MIN_REVENUE_YOY = 0.20
MIN_GROSS_MARGIN = 0.50
RSI_LOW = 40.0
RSI_HIGH = 65.0


def passes(metrics: dict[str, Any]) -> tuple[bool, list[str]]:
    """Return (passed, list_of_failed_filters)."""
    failed: list[str] = []

    rev = metrics.get("revenue_yoy")
    if rev is None or rev <= MIN_REVENUE_YOY:
        failed.append("revenue_yoy")

    gm = metrics.get("gross_margin")
    if gm is None or gm <= MIN_GROSS_MARGIN:
        failed.append("gross_margin")

    fcf = metrics.get("free_cash_flow")
    if fcf is None or fcf <= 0:
        failed.append("fcf_positive")

    rsi = metrics.get("rsi_14")
    if rsi is None or not (RSI_LOW <= rsi <= RSI_HIGH):
        failed.append("rsi_band")

    last = metrics.get("last_close")
    sma200 = metrics.get("sma_200")
    if last is None or sma200 is None or last <= sma200:
        failed.append("above_sma_200")

    return (len(failed) == 0, failed)


def evaluate(symbol: str) -> dict[str, Any] | None:
    yf_symbol = symbol.replace(".", "-")
    t = yf.Ticker(yf_symbol)
    try:
        hist = retry(
            lambda: t.history(period="400d", auto_adjust=False),
            label=f"{symbol} history",
            attempts=3,
        )
    except Exception:
        return None
    rows = serialise_history(hist)
    if len(rows) < 200:
        return None
    ind = indicator_snapshot(rows)

    try:
        info = retry(lambda: t.info or {}, label=f"{symbol} info", attempts=3)
    except Exception:
        info = {}

    metrics = {
        "revenue_yoy": _f(info.get("revenueGrowth")),
        "gross_margin": _f(info.get("grossMargins")),
        "free_cash_flow": _f(info.get("freeCashflow")),
        "rsi_14": ind["rsi_14"],
        "last_close": ind["last_close"],
        "sma_200": ind["sma_200"],
        "operating_margin": _f(info.get("operatingMargins")),
        "peg": _f(info.get("trailingPegRatio")),
        "ps_trailing": _f(info.get("priceToSalesTrailing12Months")),
    }
    ok, failed = passes(metrics)
    return {
        "symbol": symbol,
        "name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "passed": ok,
        "failed_filters": failed,
        "metrics": metrics,
    }


def main() -> int:
    load_env()
    conn = db()

    held = {row["symbol"] for row in conn.execute("SELECT symbol FROM holdings")}
    watched = {row["symbol"] for row in conn.execute("SELECT symbol FROM watchlist")}
    exclude = held | watched

    symbols = screen_universe(exclude=exclude)
    print(f"Screening {len(symbols)} symbols (excluding {len(exclude)} owned/watched)…")

    candidates: list[dict[str, Any]] = []
    evaluated: list[dict[str, Any]] = []
    for i, symbol in enumerate(symbols):
        print(f"[{i + 1}/{len(symbols)}] {symbol}", flush=True)
        try:
            res = evaluate(symbol)
        except Exception as e:
            print(f"  error: {e}", file=sys.stderr)
            res = None
        if res is not None:
            evaluated.append(res)
            if res["passed"]:
                candidates.append(res)
        time.sleep(PAUSE_SEC)

    out = {
        "screen_date": briefing_date_str(),
        "passed": candidates,
        "evaluated_count": len(evaluated),
        "passed_count": len(candidates),
    }
    out_path = snapshot_path("screen")
    with out_path.open("w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"Wrote {out_path}: {len(candidates)} passed of {len(evaluated)} evaluated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
