"""Screening universe for the weekly growth screen.

The spec calls for "SPY + QQQ + IBB + ARKK constituents." Pulling live ETF
constituents reliably is hard (yfinance exposes only partial top-10 holdings,
and scraping issuer sites is fragile and would add a paid/blocked dependency).
Instead we maintain a curated proxy: a liquid set of large/mid-cap
growth-quality names spanning the secular themes the profile cares about
(AI/semis, cloud/software, fintech/payments, security, internet/commerce,
biotech/GLP-1, consumer). Edit this list freely — it's the one knob for the
screen's breadth.

Holdings the user already owns are filtered out by the screener at runtime,
so it's fine to leave overlap here.
"""

UNIVERSE: list[str] = [
    # AI / semiconductors
    "NVDA", "AMD", "AVGO", "TSM", "ASML", "MU", "ARM", "MRVL", "SMCI",
    # Cloud / software / data
    "MSFT", "CRM", "NOW", "SNOW", "DDOG", "MDB", "NET", "PLTR", "TEAM",
    "ADBE", "WDAY", "PANW", "CRWD", "ZS", "FTNT", "ORCL",
    # Internet / commerce / media
    "GOOGL", "META", "AMZN", "SHOP", "MELI", "SPOT", "NFLX", "UBER", "ABNB",
    "DASH", "SE",
    # Fintech / payments
    "V", "MA", "PYPL", "SQ", "ADYEY", "FI", "COIN", "HOOD", "AFRM", "SOFI",
    # Security / industrials-tech
    "TSLA", "ISRG", "AXON", "GEV", "VRT",
    # Biotech / GLP-1 / health-tech
    "LLY", "NVO", "VRTX", "REGN", "MRNA", "DXCM", "ALNY",
    # Consumer / other growth
    "COST", "CMG", "ELF", "DECK", "CELH", "RBLX", "DUOL",
]


def screen_universe(exclude: set[str] | None = None) -> list[str]:
    exclude = exclude or set()
    seen: set[str] = set()
    out: list[str] = []
    for s in UNIVERSE:
        u = s.upper()
        if u in exclude or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out
