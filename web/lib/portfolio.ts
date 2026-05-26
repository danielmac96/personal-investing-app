export type Holding = {
  symbol: string;
  qty: number;
  cost_basis_per_share: number | null;
  notes: string | null;
};

export type PriceRow = {
  symbol: string;
  date: string;
  close: number;
};

export type EnrichedHolding = Holding & {
  lastClose: number | null;
  previousClose: number | null;
  marketValue: number | null;
  dayChangePct: number | null;
  totalReturnPct: number | null;
  pctOfAccount: number | null;
  asOf: string | null;
};

export type PortfolioSummary = {
  totalValue: number;
  equityValue: number;
  cash: number;
  dayChangeValue: number | null;
  dayChangePct: number | null;
  asOf: string | null;
};

/** Bucket of (lastClose, previousClose) per symbol from prices_eod. */
export type PriceMap = Map<
  string,
  { lastClose: number; previousClose: number | null; asOf: string }
>;

/**
 * Reduce a raw list of prices_eod rows (already sorted desc by date) into the
 * two most recent closes per symbol.
 */
export function buildPriceMap(rows: PriceRow[]): PriceMap {
  const map: PriceMap = new Map();
  for (const row of rows) {
    const existing = map.get(row.symbol);
    if (!existing) {
      map.set(row.symbol, {
        lastClose: Number(row.close),
        previousClose: null,
        asOf: row.date,
      });
    } else if (existing.previousClose == null) {
      existing.previousClose = Number(row.close);
    }
  }
  return map;
}

export function enrichHoldings(
  holdings: Holding[],
  prices: PriceMap,
  cash: number,
): { rows: EnrichedHolding[]; summary: PortfolioSummary } {
  let equityValue = 0;
  let prevEquityValue = 0;
  let asOf: string | null = null;
  let havePrev = true;

  const enriched: EnrichedHolding[] = holdings.map((h) => {
    const p = prices.get(h.symbol);
    const lastClose = p?.lastClose ?? null;
    const previousClose = p?.previousClose ?? null;
    const marketValue = lastClose != null ? lastClose * h.qty : null;
    const dayChangePct =
      lastClose != null && previousClose != null && previousClose !== 0
        ? lastClose / previousClose - 1
        : null;
    const totalReturnPct =
      lastClose != null && h.cost_basis_per_share && h.cost_basis_per_share > 0
        ? lastClose / Number(h.cost_basis_per_share) - 1
        : null;

    if (marketValue != null) equityValue += marketValue;
    if (lastClose != null && previousClose != null) {
      prevEquityValue += previousClose * h.qty;
    } else if (lastClose != null) {
      havePrev = false;
    }

    if (p?.asOf && (!asOf || p.asOf > asOf)) asOf = p.asOf;

    return {
      ...h,
      lastClose,
      previousClose,
      marketValue,
      dayChangePct,
      totalReturnPct,
      pctOfAccount: null,
      asOf: p?.asOf ?? null,
    };
  });

  const totalValue = equityValue + cash;
  // Compute % of account against total (incl. cash) so positions and the
  // separately-shown cash slice add to 100%.
  for (const row of enriched) {
    row.pctOfAccount =
      row.marketValue != null && totalValue > 0
        ? row.marketValue / totalValue
        : null;
  }

  const dayChangeValue =
    havePrev && prevEquityValue > 0 ? equityValue - prevEquityValue : null;
  const dayChangePct =
    dayChangeValue != null && prevEquityValue > 0
      ? dayChangeValue / prevEquityValue
      : null;

  return {
    rows: enriched,
    summary: {
      totalValue,
      equityValue,
      cash,
      dayChangeValue,
      dayChangePct,
      asOf,
    },
  };
}

/** Concentration severity for the dashboard badges. */
export function concentrationLevel(
  pctOfAccount: number | null,
): "green" | "amber" | "red" {
  if (pctOfAccount == null) return "green";
  if (pctOfAccount > 0.2) return "red";
  if (pctOfAccount > 0.15) return "amber";
  return "green";
}
