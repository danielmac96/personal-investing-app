import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatPct, formatUsd } from "@/lib/format";

export type OptionIdea = {
  symbol: string;
  type: "covered_call" | "leaps_call";
  strike: number | null;
  expiration: string | null;
  delta: number | null;
  premium?: number | null;
  annualised_yield?: number | null;
  ask?: number | null;
  breakeven?: number | null;
  reasoning?: string | null;
};

export function OptionsIdeasCard({ ideas }: { ideas: OptionIdea[] }) {
  if (ideas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Options ideas</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {ideas.map((idea, i) => (
          <div
            key={`${idea.symbol}-${idea.type}-${i}`}
            className="rounded-md border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/stocks/${encodeURIComponent(idea.symbol)}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {idea.symbol}
              </Link>
              <Badge tone={idea.type === "leaps_call" ? "blue" : "amber"}>
                {idea.type === "leaps_call" ? "LEAPS call" : "covered call"}
              </Badge>
              <span className="text-sm text-slate-600 tabular-nums">
                {idea.strike != null && `$${idea.strike} strike`}
                {idea.expiration && ` · ${formatDate(idea.expiration)}`}
                {idea.delta != null && ` · ${idea.delta.toFixed(2)}Δ`}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {idea.premium != null && (
                <span>premium {formatUsd(idea.premium)}</span>
              )}
              {idea.annualised_yield != null && (
                <span>annualised {formatPct(idea.annualised_yield)}</span>
              )}
              {idea.ask != null && <span>ask {formatUsd(idea.ask)}</span>}
              {idea.breakeven != null && (
                <span>breakeven {formatUsd(idea.breakeven)}</span>
              )}
            </div>
            {idea.reasoning && (
              <p className="mt-2 text-sm text-slate-700">{idea.reasoning}</p>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
