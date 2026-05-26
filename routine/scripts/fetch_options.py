"""Fetch option chains for the symbols the daily routine flags as eligible.

Eligibility is decided by the routine (holdings > 5% of account for covered
calls; highest-conviction names for LEAPS) and passed in as argv symbols.
This script just pulls the chains yfinance exposes and trims them to the
strikes/expirations the options-strategist cares about:

  * Covered calls: nearest expiration 30–45 DTE, calls only, ~0.20–0.40 delta
    band (delta isn't in the basic chain, so we keep OTM calls and let the
    agent estimate; we include impliedVolatility so it can reason about IV).
  * LEAPS: nearest expiration 300–730 DTE, calls only, ITM-ish (strike below
    spot down to ~30% ITM) so ~0.70 delta candidates are present.

Writes routine/data/options-<date>.json:

  { "symbol": { "spot": ..., "covered_call_expiry": "...",
                "covered_calls": [...], "leaps_expiry": "...",
                "leaps_calls": [...] }, ... }
"""

from __future__ import annotations

import json
import sys
import time
from datetime import date
from typing import Any

import yfinance as yf  # type: ignore[import-untyped]

from common import briefing_date_str, snapshot_path

PAUSE_SEC = 0.5
CC_MIN_DTE, CC_MAX_DTE = 25, 50
LEAPS_MIN_DTE, LEAPS_MAX_DTE = 300, 760


def _dte(expiry: str) -> int:
    y, m, d = (int(x) for x in expiry.split("-"))
    return (date(y, m, d) - date.today()).days


def _spot(t: yf.Ticker) -> float | None:
    try:
        fi = t.fast_info
        px = fi.get("last_price") if hasattr(fi, "get") else getattr(fi, "last_price", None)
        return float(px) if px else None
    except Exception:
        return None


def _pick_expiry(expirations: list[str], lo: int, hi: int) -> str | None:
    candidates = [(e, _dte(e)) for e in expirations]
    inrange = [e for e, dte in candidates if lo <= dte <= hi]
    if inrange:
        # closest to the middle of the band
        mid = (lo + hi) / 2
        return min(inrange, key=lambda e: abs(_dte(e) - mid))
    # fall back to the nearest expiry beyond lo
    beyond = sorted((e for e, dte in candidates if dte >= lo), key=_dte)
    return beyond[0] if beyond else None


def _calls_frame_to_rows(df, spot: float | None, lo_ratio: float, hi_ratio: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if df is None or df.empty or spot is None:
        return rows
    for _, r in df.iterrows():
        strike = float(r.get("strike", 0) or 0)
        if strike <= 0:
            continue
        ratio = strike / spot
        if not (lo_ratio <= ratio <= hi_ratio):
            continue
        rows.append({
            "strike": strike,
            "bid": _num(r.get("bid")),
            "ask": _num(r.get("ask")),
            "last_price": _num(r.get("lastPrice")),
            "implied_volatility": _num(r.get("impliedVolatility")),
            "open_interest": _int(r.get("openInterest")),
            "moneyness": round(ratio, 4),
        })
    return rows


def _num(v) -> float | None:
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def fetch_chain(symbol: str) -> dict[str, Any]:
    t = yf.Ticker(symbol.replace(".", "-"))
    spot = _spot(t)
    try:
        expirations = list(t.options or [])
    except Exception:
        expirations = []

    out: dict[str, Any] = {"spot": spot, "covered_calls": [], "leaps_calls": []}

    cc_expiry = _pick_expiry(expirations, CC_MIN_DTE, CC_MAX_DTE)
    if cc_expiry:
        try:
            chain = t.option_chain(cc_expiry)
            # OTM calls: strikes from spot up to 1.20x spot.
            out["covered_call_expiry"] = cc_expiry
            out["covered_calls"] = _calls_frame_to_rows(chain.calls, spot, 1.0, 1.20)
        except Exception as e:
            out["covered_call_error"] = str(e)

    leaps_expiry = _pick_expiry(expirations, LEAPS_MIN_DTE, LEAPS_MAX_DTE)
    if leaps_expiry:
        try:
            chain = t.option_chain(leaps_expiry)
            # ITM calls: strikes from 0.70x spot up to spot (≈ 0.6–0.8 delta).
            out["leaps_expiry"] = leaps_expiry
            out["leaps_calls"] = _calls_frame_to_rows(chain.calls, spot, 0.70, 1.0)
        except Exception as e:
            out["leaps_error"] = str(e)

    return out


def main() -> int:
    symbols = [s.upper() for s in sys.argv[1:]]
    if not symbols:
        print("usage: fetch_options.py SYMBOL [SYMBOL ...]", file=sys.stderr)
        return 2

    result: dict[str, Any] = {}
    for i, symbol in enumerate(symbols):
        print(f"[{i + 1}/{len(symbols)}] options for {symbol}…", flush=True)
        try:
            result[symbol] = fetch_chain(symbol)
        except Exception as e:
            result[symbol] = {"error": str(e)}
        time.sleep(PAUSE_SEC)

    out_path = snapshot_path("options")
    with out_path.open("w") as f:
        json.dump({"briefing_date": briefing_date_str(), "chains": result}, f, indent=2, default=str)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
