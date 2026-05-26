import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { Disclaimer } from "@/components/Disclaimer";
import { DayChangePill } from "@/components/DayChangePill";
import { HoldingsTable } from "@/components/HoldingsTable";
import { OptionsIdeasCard, type OptionIdea } from "@/components/OptionsIdeasCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatUsd } from "@/lib/format";
import {
  buildPriceMap,
  enrichHoldings,
  type Holding,
  type PriceRow,
} from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TopWatchItem = {
  symbol: string;
  signal: string;
  confidence: number;
  reasoning: string;
};

export default async function DashboardPage() {
  const supabase = createClient();

  const [holdingsRes, cashRes, pricesRes, briefingRes] = await Promise.all([
    supabase
      .from("holdings")
      .select("symbol, qty, cost_basis_per_share, notes")
      .order("symbol", { ascending: true }),
    supabase.from("cash_position").select("amount").maybeSingle(),
    // Latest two closes per symbol — fetch a generous window and reduce
    // client-side. Cheap enough for ~30 holdings.
    supabase
      .from("prices_eod")
      .select("symbol, date, close")
      .order("date", { ascending: false })
      .limit(500),
    supabase
      .from("daily_briefings")
      .select("briefing_date, portfolio_summary")
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const holdings = (holdingsRes.data ?? []) as Holding[];
  const cash = Number(cashRes.data?.amount ?? 0);
  const priceRows = (pricesRes.data ?? []) as PriceRow[];
  const briefing = briefingRes.data;

  const prices = buildPriceMap(priceRows);
  const { rows, summary } = enrichHoldings(holdings, prices, cash);

  // Pull top 3 watch items from the latest briefing's portfolio_summary, if
  // the routine wrote them. Otherwise fall back to the recommendations table.
  let topWatch: TopWatchItem[] = [];
  if (
    briefing?.portfolio_summary &&
    typeof briefing.portfolio_summary === "object"
  ) {
    const ps = briefing.portfolio_summary as {
      top_watch_items?: TopWatchItem[];
    };
    if (Array.isArray(ps.top_watch_items)) {
      topWatch = ps.top_watch_items.slice(0, 3);
    }
  }
  if (topWatch.length === 0 && briefing?.briefing_date) {
    const { data } = await supabase
      .from("recommendations")
      .select("symbol, signal, confidence, reasoning")
      .eq("briefing_date", briefing.briefing_date)
      .order("confidence", { ascending: false })
      .limit(3);
    topWatch = (data ?? []) as TopWatchItem[];
  }

  let optionsIdeas: OptionIdea[] = [];
  if (
    briefing?.portfolio_summary &&
    typeof briefing.portfolio_summary === "object"
  ) {
    const ps = briefing.portfolio_summary as { options_ideas?: OptionIdea[] };
    if (Array.isArray(ps.options_ideas)) {
      optionsIdeas = ps.options_ideas;
    }
  }

  const cashPct = summary.totalValue > 0 ? cash / summary.totalValue : 0;

  return (
    <div className="space-y-6">
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
            <form action={signOut}>
              <Button variant="ghost" type="submit">
                Sign out
              </Button>
            </form>
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
              The daily routine hasn&apos;t written a briefing yet. Phase 3
              will populate this section.
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
