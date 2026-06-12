import Link from "next/link";

import { Disclaimer } from "@/components/Disclaimer";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getPendingProposals, getWatchlist } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { AddWatchlistForm } from "./AddWatchlistForm";
import { ProposalCard, type Proposal } from "./ProposalCard";
import { WatchlistRow, type WatchlistItem } from "./WatchlistRow";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watchlist = getWatchlist() as WatchlistItem[];
  const proposals = getPendingProposals() as Proposal[];

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          ← Back to dashboard
        </Link>
      </div>

      {proposals.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Screen proposals</CardTitle>
            <span className="text-xs text-slate-500">
              {proposals.length} pending ·{" "}
              {formatDate(proposals[0]?.proposed_date)}
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              From the weekly growth screen. Approve to add to your watchlist,
              or dismiss. Information, not financial advice.
            </p>
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add to watchlist</CardTitle>
        </CardHeader>
        <CardBody>
          <AddWatchlistForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Watchlist</CardTitle>
          <span className="text-xs text-slate-500">{watchlist.length} names</span>
        </CardHeader>
        <CardBody>
          {watchlist.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing on the watchlist yet. Add a symbol above — it&apos;ll be
              picked up by the next morning briefing.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {watchlist.map((item) => (
                <WatchlistRow key={item.symbol} item={item} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Disclaimer />
    </div>
  );
}
