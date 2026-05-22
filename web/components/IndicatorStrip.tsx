import { VerdictBadge } from "@/components/VerdictBadge";
import { formatPctSigned, formatUsd } from "@/lib/format";
import {
  type IndicatorSnapshot,
  verdictDistanceTo52wHigh,
  verdictGoldenCross,
  verdictMacd,
  verdictPriceVsSma200,
  verdictRsi,
} from "@/lib/snapshots";

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function priceVsSma200Ratio(s: IndicatorSnapshot): number | null {
  if (s.last_close == null || s.sma_200 == null || s.sma_200 === 0) return null;
  return s.last_close / s.sma_200 - 1;
}

export function IndicatorStrip({ snapshot }: { snapshot: IndicatorSnapshot }) {
  const items: Array<{
    label: string;
    value: string;
    verdict: ReturnType<typeof verdictRsi>;
  }> = [
    {
      label: "SMA-50",
      value: formatUsd(snapshot.sma_50),
      verdict: verdictGoldenCross(snapshot),
    },
    {
      label: "SMA-200",
      value: formatUsd(snapshot.sma_200),
      verdict: verdictPriceVsSma200(snapshot),
    },
    {
      label: "Price vs SMA-200",
      value: formatPctSigned(priceVsSma200Ratio(snapshot)),
      verdict: verdictPriceVsSma200(snapshot),
    },
    {
      label: "RSI(14)",
      value: fmtNum(snapshot.rsi_14, 1),
      verdict: verdictRsi(snapshot),
    },
    {
      label: "MACD hist",
      value: fmtNum(snapshot.macd_histogram, 3),
      verdict: verdictMacd(snapshot),
    },
    {
      label: "52w high gap",
      value: formatPctSigned(snapshot.distance_to_52w_high),
      verdict: verdictDistanceTo52wHigh(snapshot),
    },
    {
      label: "ATR(14)",
      value: fmtNum(snapshot.atr_14, 2),
      verdict: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-slate-200 bg-white px-3 py-2"
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {it.label}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium tabular-nums">{it.value}</span>
            <VerdictBadge verdict={it.verdict} />
          </div>
        </div>
      ))}
    </div>
  );
}
