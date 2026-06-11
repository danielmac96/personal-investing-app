import Link from "next/link";

import { Disclaimer } from "@/components/Disclaimer";
import { DayChangePill } from "@/components/DayChangePill";
import { HoldingsTable } from "@/components/HoldingsTable";
import { OptionsIdeasCard, type OptionIdea } from "@/components/OptionsIdeasCard";
import { RunStatusBanner } from "@/components/RunStatusBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCash,
  getHoldings,
  getLatestBriefing,
  getLatestRun,
  getRecentCloses,
  getTopRecommendations,
} from "@/lib/db";
import { formatDate, formatUsd } from "@/lib/format";
import { buildPriceMap, enrichHoldings } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

type TopWatchItem = {
  symbol: string;
  signal: string;
  confidence: number;
  reasoning: string;
};

export default async function DashboardPage() {
  const holdings = getHoldings();
  const cash = getCash();
  const priceRows = getRecentCloses();
  const briefing = getLatestBriefing();
  const latestRun = getLatestRun();

  const prices = buildPriceMap(priceRows);
  const { rows, summary } = enrichHoldings(holdings, prices, cash);

  // Pull top 3 watch items from the latest briefing's portfolio_summary, if
  // the routine wrote them. Otherwise fall back to the recommendations table.
  let topWatch: TopWatchItem[] = [];
  const ps = briefing?.portfolio_summary as
    | { top_watch_items?: TopWatchItem[]; options_ideas?: OptionIdea[] }
    | undefined;
  if (Array.isArray(ps?.top_watch_items)) {
    topWatch = ps.top_watch_items.slice(0, 3);
  }
  if (topWatch.length === 0 && briefing?.briefing_date) {
    topWatch = getTopRecommendations(briefing.briefing_date, 3).map((r) => ({
      symbol: r.symbol,
      signal: r.signal,
      confidence: r.confidence,
      reasoning: r.reasoning,
    }));
  }

  const optionsIdeas: OptionIdea[] = Array.isArray(ps?.options_ideas)
    ? ps.options_ideas
    : [];

  const cashPct = summary.totalValue > 0 ? cash / summary.totalValue : 0;

  return (
    <div className="space-y-6">
      <RunStatusBanner run={latestRun} />

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total value
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-2xl font-semibold">
                {formatUsd(summary.totalValue)}
              </span>
              <DayChangePill value={summary.dayChangePct} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Equity {formatUsd(summary.equityValue)} · Cash {formatUsd(cash)}{" "}
              ({(cashPct * 100).toFixed(1)}%)
              {summary.asOf && ` · As of ${formatDate(summary.asOf)}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/upload">
              <Button variant="secondary">Upload CSV</Button>
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Top watch items</CardTitle>
          <span className="text-xs text-slate-500">
            {briefing?.briefing_date
              ? `Briefing ${formatDate(briefing.briefing_date)}`
              : "No briefing yet"}
          </span>
        </CardHeader>
        <CardBody>
          {topWatch.length === 0 ? (
            <p className="text-sm text-slate-500">
              The daily routine hasn&apos;t written a briefing yet. Run{" "}
              <span className="font-mono">/daily-brief</span> to populate this
              section.
            </p>
          ) : (
            <ul className="space-y-3">
              {topWatch.map((w) => (
                <li
                  key={w.symbol}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{w.symbol}</span>
                      <Badge tone="blue">{w.signal}</Badge>
                      <Badge tone="slate">conf {w.confidence}/10</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{w.reasoning}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <HoldingsTable rows={rows} />
      </Card>

      <OptionsIdeasCard ideas={optionsIdeas} />

      <Disclaimer />
    </div>
  );
}
