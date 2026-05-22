"""Pull yfinance data for all holdings + watchlist symbols.

Reads the universe from Supabase, then for each symbol fetches:
  * the last 400 trading-day OHLCV history (enough for SMA-200 + buffer)
  * Ticker.info (or fast_info as fallback) for fundamentals
  * recent news headlines
  * earnings calendar / history

Writes everything to routine/data/raw-<date>.json. A second script
(`compute_indicators.py`) reads this file and emits derived indicators
plus a structured per-symbol summary for the Claude session to feed
subagents.

Cost note: yfinance is unauthenticated and free; the requests are
rate-limited politely (≤ 1 req/sec) to avoid being banned.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

import yfinance as yf  # type: ignore[import-untyped]

from common import (
    briefing_date_str,
    load_env,
    snapshot_path,
    supabase_client,
)

HISTORY_DAYS = 400  # need ≥ 200 trading days for SMA-200; pad for holidays
NEWS_MAX = 15

# Symbols that are watchlist-only (no qty) will be tagged so downstream
# analysis can skip portfolio-doctor checks.
TICKER_PAUSE_SEC = 0.4


def fetch_universe(client) -> list[dict[str, Any]]:
    holdings = (
        client.table("holdings")
        .select("symbol, qty, cost_basis_per_share")
        .execute()
        .data
        or []
    )
    watch = (
        client.table("watchlist")
        .select("symbol")
        .execute()
        .data
        or []
    )

    held = {h["symbol"]: h for h in holdings}
    universe: list[dict[str, Any]] = []
    for h in holdings:
        universe.append({
            "symbol": h["symbol"],
            "qty": float(h["qty"]),
            "cost_basis_per_share": (
                float(h["cost_basis_per_share"])
                if h.get("cost_basis_per_share") is not None
                else None
            ),
            "watchlist_only": False,
        })
    for w in watch:
        if w["symbol"] not in held:
            universe.append({
                "symbol": w["symbol"],
                "qty": None,
                "cost_basis_per_share": None,
                "watchlist_only": True,
            })
    return universe


def serialise_history(df) -> list[dict[str, Any]]:
    """Convert a yfinance OHLCV dataframe to a JSON-safe list of rows."""
    rows: list[dict[str, Any]] = []
    if df is None or df.empty:
        return rows
    for ts, row in df.iterrows():
        rows.append({
            "date": ts.date().isoformat(),
            "open": _f(row.get("Open")),
            "high": _f(row.get("High")),
            "low": _f(row.get("Low")),
            "close": _f(row.get("Close")),
            "volume": _i(row.get("Volume")),
        })
    return rows


def _f(v) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return f if f == f else None  # NaN check
    except (TypeError, ValueError):
        return None


def _i(v) -> int | None:
    try:
        if v is None:
            return None
        i = int(v)
        return i
    except (TypeError, ValueError):
        return None


def safe_info(ticker: yf.Ticker) -> dict[str, Any]:
    try:
        info = ticker.info or {}
    except Exception as e:  # yfinance raises plain Exceptions
        return {"_error": f"info: {e}"}
    # Trim to the keys we actually use downstream — Ticker.info is huge.
    keep = {
        "shortName", "longName", "sector", "industry",
        "trailingPE", "forwardPE", "trailingPegRatio", "priceToSalesTrailing12Months",
        "enterpriseToEbitda",
        "grossMargins", "operatingMargins", "returnOnEquity", "returnOnAssets",
        "profitMargins", "freeCashflow", "totalRevenue", "totalDebt", "totalCash",
        "ebitda",
        "revenueGrowth", "earningsGrowth",
        "dividendYield", "payoutRatio",
        "targetMeanPrice", "recommendationMean", "recommendationKey",
        "numberOfAnalystOpinions",
        "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
        "marketCap",
    }
    return {k: info.get(k) for k in keep if k in info}


def safe_news(ticker: yf.Ticker) -> list[dict[str, Any]]:
    try:
        raw = ticker.news or []
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for n in raw[:NEWS_MAX]:
        # yfinance returns nested 'content' dicts in newer versions; older
        # versions are flat. Handle both.
        content = n.get("content", n)
        title = content.get("title") or n.get("title")
        if not title:
            continue
        url = None
        click = content.get("clickThroughUrl") or content.get("canonicalUrl")
        if isinstance(click, dict):
            url = click.get("url")
        url = url or content.get("link") or n.get("link")
        publisher = (
            content.get("provider", {}).get("displayName")
            if isinstance(content.get("provider"), dict)
            else None
        ) or n.get("publisher")
        published = (
            content.get("pubDate")
            or n.get("providerPublishTime")
            or content.get("displayTime")
        )
        # Normalise published to ISO 8601 string.
        published_iso: str | None
        if isinstance(published, (int, float)):
            from datetime import datetime, timezone as _tz
            published_iso = datetime.fromtimestamp(int(published), tz=_tz.utc).isoformat()
        elif isinstance(published, str):
            published_iso = published
        else:
            published_iso = None
        out.append({
            "headline": title,
            "url": url,
            "source": publisher,
            "published_at": published_iso,
        })
    return out


def safe_earnings(ticker: yf.Ticker) -> dict[str, Any]:
    """Pull earnings calendar (next report) + historical EPS estimates/actuals."""
    out: dict[str, Any] = {"upcoming": None, "history": []}

    # Upcoming: ticker.calendar (dict on newer yfinance, dataframe on older).
    try:
        cal = ticker.calendar
    except Exception:
        cal = None
    if cal is not None:
        if isinstance(cal, dict):
            date_val = cal.get("Earnings Date")
            eps_est = cal.get("Earnings Average") or cal.get("EPS Estimate Avg")
            if isinstance(date_val, list) and date_val:
                date_val = date_val[0]
            if date_val is not None:
                d = getattr(date_val, "isoformat", lambda: str(date_val))()
                out["upcoming"] = {
                    "report_date": d[:10],
                    "eps_estimate": _f(eps_est),
                }
        else:
            try:
                if not cal.empty:
                    col = cal.iloc[:, 0]
                    date_val = col.get("Earnings Date")
                    eps_est = col.get("Earnings Average")
                    if date_val is not None:
                        d = getattr(date_val, "isoformat", lambda: str(date_val))()
                        out["upcoming"] = {
                            "report_date": d[:10],
                            "eps_estimate": _f(eps_est),
                        }
            except Exception:
                pass

    # History: ticker.earnings_history (newer) → DataFrame indexed by quarter.
    try:
        hist = ticker.earnings_history
    except Exception:
        hist = None
    if hist is not None and hasattr(hist, "iterrows") and not hist.empty:
        for ts, row in hist.tail(8).iterrows():
            d = ts.date().isoformat() if hasattr(ts, "date") else str(ts)[:10]
            out["history"].append({
                "report_date": d,
                "eps_estimate": _f(row.get("epsEstimate")),
                "eps_actual": _f(row.get("epsActual")),
                "surprise_pct": _f(row.get("surprisePercent")),
            })
    return out


def fetch_symbol(symbol: str) -> dict[str, Any]:
    """yfinance uses '-' for class shares; user input has already been
    normalised by the CSV importer, but pass through to be safe."""
    yf_symbol = symbol.replace(".", "-")
    t = yf.Ticker(yf_symbol)

    try:
        history = t.history(period=f"{HISTORY_DAYS}d", auto_adjust=False)
        history_rows = serialise_history(history)
    except Exception as e:
        history_rows = []
        history_err = str(e)
    else:
        history_err = None

    return {
        "symbol": symbol,
        "history": history_rows,
        "history_error": history_err,
        "info": safe_info(t),
        "news": safe_news(t),
        "earnings": safe_earnings(t),
    }


def main() -> int:
    load_env()
    client = supabase_client()
    universe = fetch_universe(client)
    if not universe:
        print("No holdings or watchlist symbols found — nothing to fetch.", file=sys.stderr)
        return 1

    results: list[dict[str, Any]] = []
    for i, item in enumerate(universe):
        symbol = item["symbol"]
        print(f"[{i + 1}/{len(universe)}] fetching {symbol}…", flush=True)
        try:
            data = fetch_symbol(symbol)
        except Exception as e:
            data = {"symbol": symbol, "error": str(e)}
        data["holding"] = item
        results.append(data)
        time.sleep(TICKER_PAUSE_SEC)

    out_path = snapshot_path("raw")
    with out_path.open("w") as f:
        json.dump(
            {
                "briefing_date": briefing_date_str(),
                "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                "universe": universe,
                "symbols": results,
            },
            f,
            indent=2,
            default=str,
        )
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
