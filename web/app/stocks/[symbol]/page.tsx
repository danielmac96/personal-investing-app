import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalystTargetsCard } from "@/components/AnalystTargetsCard";
import { DayChangePill } from "@/components/DayChangePill";
import { Disclaimer } from "@/components/Disclaimer";
import { EarningsSection, type EarningsEvent } from "@/components/EarningsSection";
import { FundamentalsTable } from "@/components/FundamentalsTable";
import { IndicatorStrip } from "@/components/IndicatorStrip";
import { LatestRecommendationCard, type Recommendation } from "@/components/LatestRecommendationCard";
import { NewsList, type NewsItem } from "@/components/NewsList";
import { Sparkline } from "@/components/Sparkline";
import { ThesisEditor } from "@/components/ThesisEditor";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatPct, formatUsd } from "@/lib/format";
import {
  type FundamentalsSnapshot,
  type IndicatorSnapshot,
} from "@/lib/snapshots";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

type PageProps = {
  params: { symbol: string };
};

const HISTORY_DAYS = 90;

function normaliseSymbol(raw: string): string | null {
  const decoded = decodeURIComponent(raw).toUpperCase().replace(/[\/.]/g, "-");
  return SYMBOL_RE.test(decoded) ? decoded : null;
}

export default async function StockDetailPage({ params }: PageProps) {
  const symbol = normaliseSymbol(params.symbol);
  if (!symbol) notFound();

  const supabase = createClient();

  const [
    holdingRes,
    cashRes,
    pricesRes,
    fundamentalsRes,
    newsRes,
    earningsRes,
    recRes,
    thesisRes,
    allHoldingsRes,
    allPricesRes,
  ] = await Promise.all([
    supabase
      .from("holdings")
      .select("symbol, qty, cost_basis_per_share, notes")
      .eq("symbol", symbol)
      .maybeSingle(),
    supabase.from("cash_position").select("amount").maybeSingle(),
    supabase
      .from("prices_eod")
      .select("date, open, high, low, close, volume")
      .eq("symbol", symbol)
      .order("date", { ascending: false })
      .limit(HISTORY_DAYS),
    supabase
      .from("fundamentals_snapshot")
      .select("snapshot_date, data")
      .eq("symbol", symbol)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_items")
      .select("id, headline, url, published_at, sentiment, source")
      .eq("symbol", symbol)
      .order("published_at", { ascending: false })
      .limit(10),
    supabase
      .from("earnings_events")
      .select("symbol, report_date, eps_estimate, eps_actual, surprise_pct")
      .eq("symbol", symbol)
      .order("report_date", { ascending: false })
      .limit(20),
    supabase
      .from("recommendations")
      .select(
        "briefing_date, signal, confidence, reasoning, watch_items, thesis_status, indicator_snapshot",
      )
      .eq("symbol", symbol)
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("theses")
      .select("thesis_text, updated_at")
      .eq("symbol", symbol)
      .maybeSingle(),
    // For % of account we need total portfolio value, so pull every holding's
    // quantity plus the most recent close.
    supabase.from("holdings").select("symbol, qty"),
    supabase
      .from("prices_eod")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(500),
  ]);

  const holding = holdingRes.data;
  const cash = Number(cashRes.data?.amount ?? 0);
  const priceRows = (pricesRes.data ?? []).slice().reverse(); // ascending for sparkline
  const fundamentalsRow = fundamentalsRes.data;
  const news = (newsRes.data ?? []) as NewsItem[];
  const earningsAll = (earningsRes.data ?? []) as EarningsEvent[];
  const recRow = recRes.data;
  const thesisRow = thesisRes.data;

  // ---- Portfolio % computation (mirrors the dashboard) ----
  const allHoldings = (allHoldingsRes.data ?? []) as Array<{
    symbol: string;
    qty: number;
  }>;
  const lastCloseBySymbol = new Map<string, number>();
  for (const row of allPricesRes.data ?? []) {
    if (!lastCloseBySymbol.has(row.symbol)) {
      lastCloseBySymbol.set(row.symbol, Number(row.close));
    }
  }
  let equityValue = 0;
  for (const h of allHoldings) {
    const c = lastCloseBySymbol.get(h.symbol);
    if (c != null) equityValue += c * Number(h.qty);
  }
  const totalAccount = equityValue + cash;

  // ---- This symbol's basics ----
  const closes = priceRows.map((p) => Number(p.close));
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : null;
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : null;
  const dayChangePct =
    lastClose != null && prevClose != null && prevClose !== 0
      ? lastClose / prevClose - 1
      : null;
  const asOf =
    priceRows.length > 0 ? (priceRows[priceRows.length - 1].date as string) : null;

  const marketValue =
    holding && lastClose != null ? lastClose * Number(holding.qty) : null;
  const pctOfAccount =
    marketValue != null && totalAccount > 0 ? marketValue / totalAccount : null;
  const totalReturnPct =
    holding?.cost_basis_per_share &&
    Number(holding.cost_basis_per_share) > 0 &&
    lastClose != null
      ? lastClose / Number(holding.cost_basis_per_share) - 1
      : null;

  // ---- Snapshots ----
  const fundamentals = (fundamentalsRow?.data ?? null) as
    | FundamentalsSnapshot
    | null;
  const indicator = (recRow?.indicator_snapshot ?? null) as
    | IndicatorSnapshot
    | null;

  // ---- Earnings split ----
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming =
    earningsAll
      .filter((e) => e.report_date >= todayStr)
      .sort((a, b) => a.report_date.localeCompare(b.report_date))[0] ?? null;
  const history = earningsAll
    .filter((e) => e.report_date < todayStr)
    .slice(0, 4);

  const displayName = fundamentals?.name ?? symbol;
  const isHolding = holding != null;

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          ← Back to dashboard
        </Link>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <h1 className="text-2xl font-semibold">{symbol}</h1>
                {fundamentals?.name && (
                  <span className="text-base text-slate-500">
                    {fundamentals.name}
                  </span>
                )}
                {!isHolding && <Badge tone="slate">watchlist</Badge>}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="text-lg font-medium text-slate-900 tabular-nums">
                  {formatUsd(lastClose)}
                </span>
                <DayChangePill value={dayChangePct} />
                {pctOfAccount != null && (
                  <span>{formatPct(pctOfAccount)} of account</span>
                )}
                {asOf && <span>as of {formatDate(asOf)}</span>}
              </div>
              {holding && (
                <div className="text-xs text-slate-500">
                  {Number(holding.qty)} shares · cost basis{" "}
                  {holding.cost_basis_per_share != null
                    ? formatUsd(Number(holding.cost_basis_per_share))
                    : "—"}{" "}
                  {totalReturnPct != null && (
                    <>
                      · total return{" "}
                      <span
                        className={
                          totalReturnPct > 0
                            ? "text-emerald-700"
                            : totalReturnPct < 0
                              ? "text-rose-700"
                              : "text-slate-700"
                        }
                      >
                        {(totalReturnPct * 100).toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0">
              {closes.length >= 2 && (
                <Sparkline values={closes} width={220} height={48} />
              )}
            </div>
          </div>

          <ThesisEditor
            symbol={symbol}
            initialText={thesisRow?.thesis_text ?? null}
            updatedAt={(thesisRow?.updated_at as string | undefined) ?? null}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Technical indicators</CardTitle>
        </CardHeader>
        <CardBody>
          {indicator ? (
            <IndicatorStrip snapshot={indicator} />
          ) : (
            <p className="text-sm text-slate-500">
              No indicator snapshot yet. The daily routine writes these into
              the latest recommendation row.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Fundamentals</CardTitle>
          {fundamentalsRow?.snapshot_date && (
            <span className="text-xs text-slate-500">
              {formatDate(fundamentalsRow.snapshot_date as string)}
            </span>
          )}
        </CardHeader>
        {fundamentals ? (
          <FundamentalsTable snapshot={fundamentals} />
        ) : (
          <CardBody>
            <p className="text-sm text-slate-500">
              No fundamentals snapshot yet. The daily routine will populate
              this.
            </p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent news</CardTitle>
        </CardHeader>
        <NewsList items={news} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Earnings</CardTitle>
        </CardHeader>
        <EarningsSection upcoming={upcoming} history={history} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyst targets</CardTitle>
        </CardHeader>
        <AnalystTargetsCard
          analyst={fundamentals?.analyst ?? null}
          lastClose={lastClose}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest recommendation</CardTitle>
        </CardHeader>
        <LatestRecommendationCard
          recommendation={
            recRow
              ? ({
                  briefing_date: recRow.briefing_date,
                  signal: recRow.signal,
                  confidence: recRow.confidence,
                  reasoning: recRow.reasoning,
                  watch_items: recRow.watch_items,
                  thesis_status: recRow.thesis_status,
                } satisfies Recommendation)
              : null
          }
        />
      </Card>

      <p className="text-xs text-slate-500">
        Symbol displayed as <span className="font-mono">{symbol}</span>
        {displayName !== symbol && ` (${displayName})`}.
      </p>

      <Disclaimer />
    </div>
  );
}
