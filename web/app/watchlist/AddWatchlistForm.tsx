"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { addWatchlistSymbol } from "./actions";

export function AddWatchlistForm() {
  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!symbol.trim()) {
      setError("Enter a symbol.");
      return;
    }
    startTransition(async () => {
      try {
        await addWatchlistSymbol(symbol, notes);
        setSymbol("");
        setNotes("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="Symbol (e.g. CRWD)"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase sm:w-40"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {error && (
        <p className="self-center text-sm text-rose-700">{error}</p>
      )}
    </form>
  );
}
