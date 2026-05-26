import { Badge } from "@/components/ui/badge";
import { formatPct } from "@/lib/format";
import { concentrationLevel } from "@/lib/portfolio";

export function ConcentrationBadge({
  pctOfAccount,
}: {
  pctOfAccount: number | null;
}) {
  if (pctOfAccount == null) {
    return <Badge tone="neutral">—</Badge>;
  }
  const level = concentrationLevel(pctOfAccount);
  return <Badge tone={level}>{formatPct(pctOfAccount)}</Badge>;
}
