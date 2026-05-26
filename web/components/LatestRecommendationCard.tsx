import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export type Recommendation = {
  briefing_date: string;
  signal: string;
  confidence: number;
  reasoning: string;
  watch_items: unknown;
  thesis_status: string | null;
};

function signalTone(signal: string): BadgeTone {
  const s = signal.toLowerCase();
  if (s.includes("buy") || s.includes("add")) return "green";
  if (s.includes("sell") || s.includes("trim")) return "red";
  if (s.includes("hold") || s.includes("watch")) return "blue";
  return "neutral";
}

function thesisTone(status: string | null): BadgeTone {
  switch ((status ?? "").toUpperCase()) {
    case "INTACT":
      return "green";
    case "STRAINED":
      return "amber";
    case "BROKEN":
      return "red";
    default:
      return "neutral";
  }
}

function parseWatchItems(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  return [];
}

export function LatestRecommendationCard({
  recommendation,
}: {
  recommendation: Recommendation | null;
}) {
  if (!recommendation) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        No recommendation yet. The daily routine will populate this.
      </p>
    );
  }

  const watchItems = parseWatchItems(recommendation.watch_items);

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={signalTone(recommendation.signal)}>
          {recommendation.signal}
        </Badge>
        <Badge tone="slate">conf {recommendation.confidence}/10</Badge>
        {recommendation.thesis_status && (
          <Badge tone={thesisTone(recommendation.thesis_status)}>
            thesis {recommendation.thesis_status.toLowerCase()}
          </Badge>
        )}
        <span className="ml-auto text-xs text-slate-500">
          Briefing {formatDate(recommendation.briefing_date)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-slate-700">
        {recommendation.reasoning}
      </p>
      {watchItems.length > 0 && (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Watch items
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {watchItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
