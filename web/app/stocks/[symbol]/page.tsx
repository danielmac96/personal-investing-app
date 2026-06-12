import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalystTargetsCard } from "@/components/AnalystTargetsCard";
import { DayChangePill } from "@/components/DayChangePill";
import { Disclaimer } from "@/components/Disclaimer";
import { EarningsSection, type EarningsEvent } from "@/components/EarningsSection";
import { FundamentalsTable } from "@/components/FundamentalsTable";
import { IndicatorStrip } from "@/components/IndicatorStrip";
import { LatestRecommendationCard, type Recommendation } from "@/components/LatestRecommendationCard";
import { NewsList } from "@/components/NewsList";
import { Sparkline } from "@/components/Sparkline";
import { ThesisEditor } from "@/components/ThesisEditor";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCash,
  getEarnings,
  getHolding,
  getHoldings,
  getLatestFundamentals,
  getLatestRecommendation,
  getNews,
  getPriceHistory,
  getRecentCloses,
  getThesis,
  normaliseSymbol,
} from "@/lib/db";
import { formatDate, formatPct, formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { symbol: string };
};

const HISTORY_DAYS = 90;

export default async function StockDetailPage({ params }: PageProps) {
  const symbol = normaliseSymbol(params.symbol);
  if (!symbol) notFound();

  const holding = getHolding(symbol);
  const cash = getCash();
  const priceRows = getPriceHistory(symbol, HISTORY_DAYS).reverse(); // ascending for sparkline
  const fundamentalsRow = getLatestFundamentals(symbol);
  const news = getNews(symbol, 10);
  const earningsAll = getEarnings(symbol, 20) as EarningsEvent[];
  const recRow = getLatestRecommendation(symbol);
  const thesisRow = getThesis(symbol);

  // ---- Portfolio % computation (mirrors the dashboard) ----
  const allHoldings = getHoldings();
  const lastCloseBySymbol = new Map<string, number>();
  for (const row of getRecentCloses()) {
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
    priceRows.length > 0 ? priceRows[priceRows.length - 1].date : null;

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
  const fundamentals = fundamentalsRow?.data ?? null;
  const indicator = recRow?.indicator_snapshot ?? null;

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
            updatedAt={thesisRow?.updated_at ?? null}
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
              {formatDate(fundamentalsRow.snapshot_date)}
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
