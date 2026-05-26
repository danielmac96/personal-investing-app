"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { removeWatchlistSymbol } from "./actions";

export type WatchlistItem = {
  symbol: string;
  notes: string | null;
  added_at: string;
};

export function WatchlistRow({ item }: { item: WatchlistItem }) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <Link
          href={`/stocks/${encodeURIComponent(item.symbol)}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {item.symbol}
        </Link>
        {item.notes && (
          <p className="truncate text-xs text-slate-500">{item.notes}</p>
        )}
      </div>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await removeWatchlistSymbol(item.symbol);
          })
        }
      >
        {pending ? "…" : "Remove"}
      </Button>
    </li>
  );
}
