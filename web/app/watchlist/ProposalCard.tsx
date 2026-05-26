"use client";

import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { approveProposal, dismissProposal } from "./actions";

export type Proposal = {
  id: number;
  symbol: string;
  proposed_date: string;
  screen_metrics: Record<string, unknown> | null;
  confidence: number | null;
  reasoning: string | null;
};

function formatMetric(key: string, value: unknown): string {
  if (typeof value !== "number") return String(value);
  // Heuristics for display: margins/growth are ratios, RSI/prices are plain.
  if (/margin|growth|yoy|cagr|yield/i.test(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [pending, startTransition] = useTransition();
  const metrics = proposal.screen_metrics ?? {};

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{proposal.symbol}</span>
        {proposal.confidence != null && (
          <Badge tone="slate">conf {proposal.confidence}/10</Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await approveProposal(
                  proposal.id,
                  proposal.symbol,
                  proposal.reasoning ?? "",
                );
              })
            }
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissProposal(proposal.id);
              })
            }
          >
            Dismiss
          </Button>
        </div>
      </div>
      {proposal.reasoning && (
        <p className="mt-2 text-sm text-slate-700">{proposal.reasoning}</p>
      )}
      {Object.keys(metrics).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {Object.entries(metrics).map(([k, v]) => (
            <span key={k}>
              {k}: <span className="tabular-nums">{formatMetric(k, v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
