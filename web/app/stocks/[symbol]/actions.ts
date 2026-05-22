"use server";

import { revalidatePath } from "next/cache";

import { ALLOWED_EMAIL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

export async function saveThesis(
  symbol: string,
  thesisText: string,
): Promise<{ updated_at: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ALLOWED_EMAIL) {
    throw new Error("Not authorised.");
  }

  const normalised = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(normalised)) {
    throw new Error("Invalid symbol.");
  }

  const trimmed = thesisText.trim();
  if (trimmed.length > 5000) {
    throw new Error("Thesis is too long (max 5000 chars).");
  }

  if (trimmed.length === 0) {
    const { error } = await supabase
      .from("theses")
      .delete()
      .eq("symbol", normalised);
    if (error) throw new Error(error.message);
    revalidatePath(`/stocks/${normalised}`);
    return { updated_at: new Date().toISOString() };
  }

  const { data, error } = await supabase
    .from("theses")
    .upsert(
      { symbol: normalised, thesis_text: trimmed },
      { onConflict: "symbol" },
    )
    .select("updated_at")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/stocks/${normalised}`);
  return { updated_at: data.updated_at as string };
}
