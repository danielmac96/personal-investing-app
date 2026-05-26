"use server";

import { revalidatePath } from "next/cache";

import { ALLOWED_EMAIL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

function normaliseSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[/.]/g, "-");
}

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ALLOWED_EMAIL) {
    throw new Error("Not authorised.");
  }
  return supabase;
}

export async function addWatchlistSymbol(
  symbolRaw: string,
  notes: string,
): Promise<void> {
  const supabase = await requireUser();
  const symbol = normaliseSymbol(symbolRaw);
  if (!SYMBOL_RE.test(symbol)) {
    throw new Error("Invalid symbol.");
  }
  const trimmedNotes = notes.trim().slice(0, 1000) || null;
  const { error } = await supabase
    .from("watchlist")
    .upsert({ symbol, notes: trimmedNotes }, { onConflict: "symbol" });
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}

export async function removeWatchlistSymbol(symbolRaw: string): Promise<void> {
  const supabase = await requireUser();
  const symbol = normaliseSymbol(symbolRaw);
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("symbol", symbol);
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}

export async function approveProposal(
  id: number,
  symbolRaw: string,
  notes: string,
): Promise<void> {
  const supabase = await requireUser();
  const symbol = normaliseSymbol(symbolRaw);
  if (!SYMBOL_RE.test(symbol)) {
    throw new Error("Invalid symbol.");
  }

  const { error: addErr } = await supabase
    .from("watchlist")
    .upsert(
      { symbol, notes: notes.trim().slice(0, 1000) || null },
      { onConflict: "symbol" },
    );
  if (addErr) throw new Error(addErr.message);

  const { error: statusErr } = await supabase
    .from("watchlist_proposals")
    .update({ status: "approved" })
    .eq("id", id);
  if (statusErr) throw new Error(statusErr.message);

  revalidatePath("/watchlist");
}

export async function dismissProposal(id: number): Promise<void> {
  const supabase = await requireUser();
  const { error } = await supabase
    .from("watchlist_proposals")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/watchlist");
}
