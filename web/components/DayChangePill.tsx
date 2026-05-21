import { Badge } from "@/components/ui/badge";
import { formatPctSigned } from "@/lib/format";

export function DayChangePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <Badge tone="neutral">—</Badge>;
  }
  const tone = value > 0 ? "green" : value < 0 ? "red" : "neutral";
  return <Badge tone={tone}>{formatPctSigned(value)}</Badge>;
}
