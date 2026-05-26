"""Compute technical indicators + a structured summary per symbol.

Reads routine/data/raw-<date>.json (from fetch_market_data.py) and writes
routine/data/indicators-<date>.json containing, per symbol:

  * the latest indicator snapshot (matches lib/snapshots.ts IndicatorSnapshot)
  * the fundamentals snapshot (matches FundamentalsSnapshot)
  * the most recent close + previous close (for day-change)
  * trimmed news + earnings, ready to insert
  * raw history is NOT carried forward — the Claude session never needs it.

Indicator math is implemented directly in pandas/numpy to avoid the
unmaintained pandas-ta dep. These are well-known formulas:

  SMA-N:        rolling mean of close
  RSI(14):      Wilder's smoothing of gains/losses over 14 days
  MACD(12,26,9) histogram: EMA(12) - EMA(26), then - EMA(9) of that
  ATR(14):      Wilder's smoothing of TR over 14 days
  52w stats:    rolling 252-day high/low
"""

from __future__ import annotations

import json
import sys
from typing import Any

import numpy as np
import pandas as pd

from common import briefing_date_str, snapshot_path


# ---------------------------------------------------------------------------
# Indicator functions
# ---------------------------------------------------------------------------

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder's smoothing == EMA with alpha = 1/period.
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd_histogram(series: pd.Series) -> pd.Series:
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    return macd_line - signal_line


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close_prev = df["close"].shift(1)
    tr = pd.concat([
        (high - low).abs(),
        (high - close_prev).abs(),
        (low - close_prev).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def indicator_snapshot(history: list[dict[str, Any]]) -> dict[str, Any]:
    """Reduce raw OHLCV rows to the latest IndicatorSnapshot."""
    if len(history) < 2:
        return {
            "last_close": _f(history[-1]["close"]) if history else None,
            "sma_50": None,
            "sma_200": None,
            "rsi_14": None,
            "macd_histogram": None,
            "atr_14": None,
            "high_52w": None,
            "low_52w": None,
            "distance_to_52w_high": None,
        }

    df = pd.DataFrame(history).sort_values("date").reset_index(drop=True)
    close = df["close"]
    sma_50 = close.rolling(50).mean()
    sma_200 = close.rolling(200).mean()
    rsi_14 = rsi(close, 14)
    macd_h = macd_histogram(close)
    atr_14 = atr(df, 14)
    high_52 = df["high"].rolling(252, min_periods=20).max()
    low_52 = df["low"].rolling(252, min_periods=20).min()

    last_close = _f(close.iloc[-1])
    h52 = _f(high_52.iloc[-1])
    dist = (
        (last_close - h52) / h52
        if last_close is not None and h52 is not None and h52 != 0
        else None
    )

    return {
        "last_close": last_close,
        "sma_50": _f(sma_50.iloc[-1]),
        "sma_200": _f(sma_200.iloc[-1]),
        "rsi_14": _f(rsi_14.iloc[-1]),
        "macd_histogram": _f(macd_h.iloc[-1]),
        "atr_14": _f(atr_14.iloc[-1]),
        "high_52w": h52,
        "low_52w": _f(low_52.iloc[-1]),
        "distance_to_52w_high": _f(dist),
    }


def previous_close(history: list[dict[str, Any]]) -> float | None:
    if len(history) < 2:
        return None
    return _f(history[-2]["close"])


# ---------------------------------------------------------------------------
# Fundamentals + 5y ranges
# ---------------------------------------------------------------------------

def fundamentals_from_info(info: dict[str, Any]) -> dict[str, Any]:
    """Map yfinance's Ticker.info keys to FundamentalsSnapshot."""
    rev = _f(info.get("totalRevenue"))
    fcf = _f(info.get("freeCashflow"))
    debt = _f(info.get("totalDebt"))
    cash = _f(info.get("totalCash"))
    ebitda = _f(info.get("ebitda"))
    net_debt_to_ebitda = (
        (debt - cash) / ebitda
        if debt is not None and cash is not None and ebitda not in (None, 0)
        else None
    )
    fcf_margin = (
        fcf / rev
        if fcf is not None and rev not in (None, 0)
        else None
    )

    snapshot: dict[str, Any] = {
        "name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "pe_trailing": _f(info.get("trailingPE")),
        "pe_forward": _f(info.get("forwardPE")),
        "peg": _f(info.get("trailingPegRatio")),
        "ps_trailing": _f(info.get("priceToSalesTrailing12Months")),
        "ev_to_ebitda": _f(info.get("enterpriseToEbitda")),
        "gross_margin": _f(info.get("grossMargins")),
        "operating_margin": _f(info.get("operatingMargins")),
        "roe": _f(info.get("returnOnEquity")),
        "roic": None,  # yfinance doesn't expose ROIC directly; left null
        "fcf_margin": fcf_margin,
        "net_debt_to_ebitda": net_debt_to_ebitda,
        "revenue_yoy": _f(info.get("revenueGrowth")),
        "eps_yoy": _f(info.get("earningsGrowth")),
        "revenue_cagr_5y": None,  # would need separate fetch; left null for v1
        "dividend_yield": _f(info.get("dividendYield")),
        "payout_ratio": _f(info.get("payoutRatio")),
        "ranges_5y": {},  # left empty in v1 (Ticker.info doesn't expose ranges)
        "analyst": {
            "mean_target": _f(info.get("targetMeanPrice")),
            "recommendation_mean": _f(info.get("recommendationMean")),
            "recommendation_key": info.get("recommendationKey"),
            "number_of_analysts": _f(info.get("numberOfAnalystOpinions")),
        },
    }
    return snapshot


# ---------------------------------------------------------------------------
# News + earnings shaping
# ---------------------------------------------------------------------------

def shape_news(symbol: str, raw_news: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for n in raw_news:
        if not n.get("headline") or not n.get("published_at"):
            continue
        out.append({
            "symbol": symbol,
            "headline": n["headline"],
            "url": n.get("url"),
            "published_at": n["published_at"],
            "source": n.get("source"),
            # sentiment is filled in later by the news-scanner subagent
            "sentiment": None,
        })
    return out


def shape_earnings(symbol: str, raw: dict[str, Any]) -> dict[str, Any]:
    upcoming = raw.get("upcoming")
    history = []
    for h in raw.get("history") or []:
        if not h.get("report_date"):
            continue
        history.append({
            "symbol": symbol,
            "report_date": h["report_date"],
            "eps_estimate": _f(h.get("eps_estimate")),
            "eps_actual": _f(h.get("eps_actual")),
            "surprise_pct": _f(h.get("surprise_pct")),
        })
    return {
        "upcoming": (
            {
                "symbol": symbol,
                "report_date": upcoming["report_date"],
                "eps_estimate": _f(upcoming.get("eps_estimate")),
                "eps_actual": None,
                "surprise_pct": None,
            }
            if upcoming and upcoming.get("report_date")
            else None
        ),
        "history": history,
    }


# ---------------------------------------------------------------------------
# Price upserts (latest 5 trading days so prices_eod gets backfilled if a day
# was missed)
# ---------------------------------------------------------------------------

def recent_prices(symbol: str, history: list[dict[str, Any]], days: int = 5) -> list[dict[str, Any]]:
    rows = []
    for h in history[-days:]:
        if h.get("close") is None or not h.get("date"):
            continue
        rows.append({
            "symbol": symbol,
            "date": h["date"],
            "open": _f(h.get("open")),
            "high": _f(h.get("high")),
            "low": _f(h.get("low")),
            "close": _f(h["close"]),
            "volume": h.get("volume"),
        })
    return rows


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main() -> int:
    in_path = snapshot_path("raw")
    with in_path.open() as f:
        raw = json.load(f)

    symbols_out = []
    all_prices: list[dict[str, Any]] = []
    all_news: list[dict[str, Any]] = []
    all_earnings_upcoming: list[dict[str, Any]] = []
    all_earnings_history: list[dict[str, Any]] = []

    for entry in raw["symbols"]:
        symbol = entry["symbol"]
        history = entry.get("history") or []
        info = entry.get("info") or {}
        ind = indicator_snapshot(history)
        fund = fundamentals_from_info(info)
        news = shape_news(symbol, entry.get("news") or [])
        earnings = shape_earnings(symbol, entry.get("earnings") or {})

        prev_close = previous_close(history)
        day_change_pct = (
            (ind["last_close"] - prev_close) / prev_close
            if ind["last_close"] is not None and prev_close not in (None, 0)
            else None
        )

        symbols_out.append({
            "symbol": symbol,
            "holding": entry.get("holding"),
            "indicator_snapshot": ind,
            "fundamentals_snapshot": fund,
            "previous_close": prev_close,
            "day_change_pct": day_change_pct,
            "news_summary": [
                {k: v for k, v in n.items() if k != "symbol"} for n in news
            ],
            "earnings_summary": {
                "upcoming": earnings["upcoming"],
                "history": earnings["history"][-4:],
            },
        })

        all_prices.extend(recent_prices(symbol, history))
        all_news.extend(news)
        if earnings["upcoming"]:
            all_earnings_upcoming.append(earnings["upcoming"])
        all_earnings_history.extend(earnings["history"])

    out = {
        "briefing_date": raw.get("briefing_date") or briefing_date_str(),
        "symbols": symbols_out,
        "writeables": {
            "prices_eod": all_prices,
            "news_items": all_news,
            "earnings_events": all_earnings_upcoming + all_earnings_history,
            "fundamentals_snapshot": [
                {
                    "symbol": s["symbol"],
                    "snapshot_date": raw.get("briefing_date") or briefing_date_str(),
                    "data": s["fundamentals_snapshot"],
                }
                for s in symbols_out
            ],
        },
    }

    out_path = snapshot_path("indicators")
    with out_path.open("w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
