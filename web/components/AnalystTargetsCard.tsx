import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatPctSigned, formatUsd } from "@/lib/format";
import type { AnalystSummary } from "@/lib/snapshots";

function recommendationTone(key: string | null | undefined): BadgeTone {
  const k = (key ?? "").toLowerCase();
  if (k.includes("strong buy") || k === "strongbuy") return "green";
  if (k.includes("buy")) return "green";
  if (k.includes("hold")) return "amber";
  if (k.includes("sell")) return "red";
  return "neutral";
}

export function AnalystTargetsCard({
  analyst,
  lastClose,
}: {
  analyst: AnalystSummary | null | undefined;
  lastClose: number | null;
}) {
  if (!analyst) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        No analyst data yet. The daily routine will populate this.
      </p>
    );
  }

  const upside =
    analyst.mean_target != null && lastClose != null && lastClose > 0
      ? analyst.mean_target / lastClose - 1
      : null;

  return (
    <dl className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
      <div>
        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Mean target
        </dt>
        <dd className="mt-0.5 text-base font-medium tabular-nums">
          {formatUsd(analyst.mean_target)}
        </dd>
      </div>
      <div>
        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Implied upside
        </dt>
        <dd className="mt-0.5 text-base font-medium tabular-nums">
          {formatPctSigned(upside)}
        </dd>
      </div>
      <div>
        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Recommendation
        </dt>
        <dd className="mt-0.5">
          <Badge tone={recommendationTone(analyst.recommendation_key)}>
            {analyst.recommendation_key ?? "—"}
          </Badge>
        </dd>
      </div>
      <div>
        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Analysts
        </dt>
        <dd className="mt-0.5 text-base font-medium tabular-nums">
          {analyst.number_of_analysts ?? "—"}
        </dd>
      </div>
    </dl>
  );
}
