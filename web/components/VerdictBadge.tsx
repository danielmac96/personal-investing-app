import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { Verdict } from "@/lib/snapshots";

const TONE: Record<Verdict, BadgeTone> = {
  bullish: "green",
  neutral: "neutral",
  bearish: "red",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <Badge tone={TONE[verdict]}>{verdict}</Badge>;
}
