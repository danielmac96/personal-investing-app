import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPct } from "@/lib/format";
import {
  FUNDAMENTAL_METRICS,
  type FundamentalsSnapshot,
  type MetricFormat,
} from "@/lib/snapshots";

function fmt(value: number | null | undefined, format: MetricFormat): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (format === "percent") return formatPct(value);
  if (format === "multiple") return `${value.toFixed(1)}×`;
  return value.toFixed(2);
}

function fmtRange(
  range: { min: number | null; max: number | null } | undefined,
  format: MetricFormat,
): string {
  if (!range || (range.min == null && range.max == null)) return "—";
  return `${fmt(range.min, format)} – ${fmt(range.max, format)}`;
}

export function FundamentalsTable({
  snapshot,
}: {
  snapshot: FundamentalsSnapshot;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Metric</TH>
          <TH className="text-right">Current</TH>
          <TH className="text-right">5-yr range</TH>
        </TR>
      </THead>
      <TBody>
        {FUNDAMENTAL_METRICS.map((m) => {
          const value = snapshot[m.key] as number | null | undefined;
          const range = snapshot.ranges_5y?.[m.key];
          return (
            <TR key={m.key}>
              <TD>{m.label}</TD>
              <TD className="text-right">{fmt(value, m.format)}</TD>
              <TD className="text-right text-slate-500">
                {fmtRange(range, m.format)}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
