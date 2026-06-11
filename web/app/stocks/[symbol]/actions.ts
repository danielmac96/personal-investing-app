"use server";

import { revalidatePath } from "next/cache";

import { deleteThesis, upsertThesis } from "@/lib/db";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

export async function saveThesis(
  symbol: string,
  thesisText: string,
): Promise<{ updated_at: string }> {
  const normalised = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(normalised)) {
    throw new Error("Invalid symbol.");
  }

  const trimmed = thesisText.trim();
  if (trimmed.length > 5000) {
    throw new Error("Thesis is too long (max 5000 chars).");
  }

  if (trimmed.length === 0) {
    deleteThesis(normalised);
    revalidatePath(`/stocks/${normalised}`);
    return { updated_at: new Date().toISOString() };
  }

  const updatedAt = upsertThesis(normalised, trimmed);
  revalidatePath(`/stocks/${normalised}`);
  return { updated_at: updatedAt };
}
