import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export type NewsItem = {
  id: number;
  headline: string;
  url: string | null;
  published_at: string;
  sentiment: string | null;
  source: string | null;
};

function sentimentTone(sentiment: string | null): BadgeTone {
  const s = (sentiment ?? "").toLowerCase();
  if (s === "positive" || s === "bullish") return "green";
  if (s === "negative" || s === "bearish") return "red";
  if (s === "mixed") return "amber";
  return "neutral";
}

export function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        No news items yet. The daily routine will populate this.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const content = (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-900">{n.headline}</p>
              {n.sentiment && (
                <Badge tone={sentimentTone(n.sentiment)}>{n.sentiment}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {n.source && <span>{n.source}</span>}
              {n.source && <span aria-hidden="true">·</span>}
              <span>{formatDate(n.published_at)}</span>
            </div>
          </div>
        );
        return (
          <li key={n.id} className="px-4 py-3">
            {n.url ? (
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-slate-50"
              >
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
