import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatPctSigned } from "@/lib/format";

export type EarningsEvent = {
  symbol: string;
  report_date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  surprise_pct: number | null;
};

function fmtEps(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const today = new Date();
  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function EarningsSection({
  upcoming,
  history,
}: {
  upcoming: EarningsEvent | null;
  history: EarningsEvent[];
}) {
  if (!upcoming && history.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        No earnings data yet. The daily routine will populate this.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Next report
        </div>
        {upcoming ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-base font-semibold">
              {formatDate(upcoming.report_date)}
            </span>
            <span className="text-sm text-slate-600">
              in {daysUntil(upcoming.report_date)} days
            </span>
            <span className="text-sm text-slate-600">
              consensus EPS {fmtEps(upcoming.eps_estimate)}
            </span>
            {daysUntil(upcoming.report_date) <= 14 && (
              <Badge tone="amber">earnings &lt; 2 weeks</Badge>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No upcoming report scheduled.</p>
        )}
      </div>

      {history.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Report date</TH>
              <TH className="text-right">Estimate</TH>
              <TH className="text-right">Actual</TH>
              <TH className="text-right">Surprise</TH>
              <TH className="text-right">Result</TH>
            </TR>
          </THead>
          <TBody>
            {history.map((e) => {
              const beat = e.surprise_pct == null ? null : e.surprise_pct > 0;
              return (
                <TR key={e.report_date}>
                  <TD>{formatDate(e.report_date)}</TD>
                  <TD className="text-right">{fmtEps(e.eps_estimate)}</TD>
                  <TD className="text-right">{fmtEps(e.eps_actual)}</TD>
                  <TD className="text-right">
                    {formatPctSigned(e.surprise_pct)}
                  </TD>
                  <TD className="text-right">
                    {beat == null ? (
                      <Badge tone="neutral">—</Badge>
                    ) : beat ? (
                      <Badge tone="green">beat</Badge>
                    ) : (
                      <Badge tone="red">miss</Badge>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
