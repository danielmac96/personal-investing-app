import Link from "next/link";

import { ConcentrationBadge } from "@/components/ConcentrationBadge";
import { DayChangePill } from "@/components/DayChangePill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  formatPctSigned,
  formatQty,
  formatUsd,
} from "@/lib/format";
import type { EnrichedHolding } from "@/lib/portfolio";

export function HoldingsTable({ rows }: { rows: EnrichedHolding[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        No holdings yet. Upload a Schwab CSV at{" "}
        <a href="/upload" className="underline">
          /upload
        </a>{" "}
        to get started.
      </p>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Symbol</TH>
          <TH className="text-right">Qty</TH>
          <TH className="text-right">Last close</TH>
          <TH className="text-right">Day</TH>
          <TH className="text-right">Mkt value</TH>
          <TH className="text-right">% acct</TH>
          <TH className="text-right">Total return</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.symbol}>
            <TD className="font-medium">
              <Link
                href={`/stocks/${encodeURIComponent(r.symbol)}`}
                className="text-slate-900 hover:underline"
              >
                {r.symbol}
              </Link>
            </TD>
            <TD className="text-right">{formatQty(r.qty)}</TD>
            <TD className="text-right">{formatUsd(r.lastClose)}</TD>
            <TD className="text-right">
              <DayChangePill value={r.dayChangePct} />
            </TD>
            <TD className="text-right">{formatUsd(r.marketValue)}</TD>
            <TD className="text-right">
              <ConcentrationBadge pctOfAccount={r.pctOfAccount} />
            </TD>
            <TD className="text-right">
              {r.totalReturnPct == null ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span
                  className={
                    r.totalReturnPct > 0
                      ? "text-emerald-700"
                      : r.totalReturnPct < 0
                        ? "text-rose-700"
                        : "text-slate-700"
                  }
                >
                  {formatPctSigned(r.totalReturnPct)}
                </span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
