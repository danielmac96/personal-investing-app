/**
 * Shapes for the JSONB blobs the daily routine (Phase 3) writes into
 * `fundamentals_snapshot.data` and `recommendations.indicator_snapshot`.
 *
 * Pinning these here so Phase 2 read code and Phase 3 write code agree.
 * All fields are nullable — yfinance returns sparse data, especially for
 * ETFs, non-US listings, and small caps.
 */

export type Verdict = "bullish" | "neutral" | "bearish";

// ---------------------------------------------------------------------------
// Technical indicators (recommendations.indicator_snapshot)
// ---------------------------------------------------------------------------

export type IndicatorSnapshot = {
  last_close: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd_histogram: number | null;
  atr_14: number | null;
  high_52w: number | null;
  low_52w: number | null;
  /** (last_close - high_52w) / high_52w; -0.08 means 8% below the high. */
  distance_to_52w_high: number | null;
};

export function verdictPriceVsSma200(s: IndicatorSnapshot): Verdict {
  if (s.last_close == null || s.sma_200 == null) return "neutral";
  const ratio = s.last_close / s.sma_200 - 1;
  if (ratio > 0.02) return "bullish";
  if (ratio < -0.02) return "bearish";
  return "neutral";
}

export function verdictGoldenCross(s: IndicatorSnapshot): Verdict {
  if (s.sma_50 == null || s.sma_200 == null) return "neutral";
  if (s.sma_50 > s.sma_200) return "bullish";
  if (s.sma_50 < s.sma_200) return "bearish";
  return "neutral";
}

export function verdictRsi(s: IndicatorSnapshot): Verdict {
  // For aggressive growth: RSI > 70 not auto-overbought in strong trends;
  // treat extreme readings as caution, not reversal.
  if (s.rsi_14 == null) return "neutral";
  if (s.rsi_14 < 30) return "bearish";
  if (s.rsi_14 > 80) return "bearish"; // overbought caution
  if (s.rsi_14 >= 50) return "bullish";
  return "neutral";
}

export function verdictMacd(s: IndicatorSnapshot): Verdict {
  if (s.macd_histogram == null) return "neutral";
  if (s.macd_histogram > 0) return "bullish";
  if (s.macd_histogram < 0) return "bearish";
  return "neutral";
}

export function verdictDistanceTo52wHigh(s: IndicatorSnapshot): Verdict {
  if (s.distance_to_52w_high == null) return "neutral";
  // Within ~5% of the high → strong; 5–20% off → neutral; >20% off → bearish.
  if (s.distance_to_52w_high > -0.05) return "bullish";
  if (s.distance_to_52w_high < -0.2) return "bearish";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Fundamentals (fundamentals_snapshot.data)
// ---------------------------------------------------------------------------

export type FundamentalsRange = {
  min: number | null;
  max: number | null;
};

export type AnalystSummary = {
  mean_target: number | null;
  /** yfinance convention: 1.0 strong buy ... 5.0 strong sell */
  recommendation_mean: number | null;
  recommendation_key: string | null;
  number_of_analysts: number | null;
};

export type FundamentalsSnapshot = {
  name: string | null;
  sector: string | null;
  industry: string | null;

  // Valuation
  pe_trailing: number | null;
  pe_forward: number | null;
  peg: number | null;
  ps_trailing: number | null;
  ev_to_ebitda: number | null;

  // Profitability / quality
  gross_margin: number | null;
  operating_margin: number | null;
  roe: number | null;
  roic: number | null;
  fcf_margin: number | null;
  net_debt_to_ebitda: number | null;

  // Growth
  revenue_yoy: number | null;
  eps_yoy: number | null;
  revenue_cagr_5y: number | null;

  // Income
  dividend_yield: number | null;
  payout_ratio: number | null;

  // 5-year ranges, keyed by metric name above. Omitted keys → no range.
  ranges_5y?: Partial<Record<keyof FundamentalsSnapshot, FundamentalsRange>>;

  analyst?: AnalystSummary;
};

/** Format types used by the fundamentals table renderer. */
export type MetricFormat = "ratio" | "percent" | "multiple";

export type MetricSpec = {
  key: keyof FundamentalsSnapshot;
  label: string;
  format: MetricFormat;
};

export const FUNDAMENTAL_METRICS: MetricSpec[] = [
  { key: "pe_trailing", label: "P/E (trailing)", format: "multiple" },
  { key: "pe_forward", label: "P/E (forward)", format: "multiple" },
  { key: "peg", label: "PEG", format: "multiple" },
  { key: "ps_trailing", label: "P/S", format: "multiple" },
  { key: "ev_to_ebitda", label: "EV / EBITDA", format: "multiple" },
  { key: "gross_margin", label: "Gross margin", format: "percent" },
  { key: "operating_margin", label: "Operating margin", format: "percent" },
  { key: "roe", label: "ROE", format: "percent" },
  { key: "roic", label: "ROIC", format: "percent" },
  { key: "fcf_margin", label: "FCF margin", format: "percent" },
  { key: "net_debt_to_ebitda", label: "Net debt / EBITDA", format: "ratio" },
  { key: "revenue_yoy", label: "Revenue YoY", format: "percent" },
  { key: "eps_yoy", label: "EPS YoY", format: "percent" },
  { key: "revenue_cagr_5y", label: "Revenue CAGR (5y)", format: "percent" },
  { key: "dividend_yield", label: "Dividend yield", format: "percent" },
  { key: "payout_ratio", label: "Payout ratio", format: "percent" },
];
