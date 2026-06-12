"use server";

import { revalidatePath } from "next/cache";

import {
  deleteWatchlistSymbol,
  setProposalStatus,
  upsertWatchlistSymbol,
} from "@/lib/db";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

function normaliseSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[/.]/g, "-");
}

export async function addWatchlistSymbol(
  symbolRaw: string,
  notes: string,
): Promise<void> {
  const symbol = normaliseSymbol(symbolRaw);
  if (!SYMBOL_RE.test(symbol)) {
    throw new Error("Invalid symbol.");
  }
  const trimmedNotes = notes.trim().slice(0, 1000) || null;
  upsertWatchlistSymbol(symbol, trimmedNotes);
  revalidatePath("/watchlist");
}

export async function removeWatchlistSymbol(symbolRaw: string): Promise<void> {
  deleteWatchlistSymbol(normaliseSymbol(symbolRaw));
  revalidatePath("/watchlist");
}

export async function approveProposal(
  id: number,
  symbolRaw: string,
  notes: string,
): Promise<void> {
  const symbol = normaliseSymbol(symbolRaw);
  if (!SYMBOL_RE.test(symbol)) {
    throw new Error("Invalid symbol.");
  }
  upsertWatchlistSymbol(symbol, notes.trim().slice(0, 1000) || null);
  setProposalStatus(id, "approved");
  revalidatePath("/watchlist");
}

export async function dismissProposal(id: number): Promise<void> {
  setProposalStatus(id, "dismissed");
  revalidatePath("/watchlist");
}
