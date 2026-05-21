"use server";

import { revalidatePath } from "next/cache";

import { ALLOWED_EMAIL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type ImportPayload = {
  holdings: Array<{
    symbol: string;
    qty: number;
    cost_basis_per_share: number | null;
  }>;
  cash: number | null;
};

export async function importPortfolio(payload: ImportPayload): Promise<{
  holdingsUpserted: number;
  cashSet: boolean;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ALLOWED_EMAIL) {
    throw new Error("Not authorised.");
  }

  if (payload.holdings.length === 0 && payload.cash == null) {
    throw new Error("Nothing to import.");
  }

  // Preserve cost basis when the new CSV doesn't include one. We can't do
  // this in a single upsert because the conditional logic is per-row, so we
  // read existing rows first and merge in memory. Tiny portfolio = cheap.
  let cashSet = false;

  if (payload.holdings.length > 0) {
    const symbols = payload.holdings.map((h) => h.symbol);
    const { data: existing, error: existingErr } = await supabase
      .from("holdings")
      .select("symbol, cost_basis_per_share")
      .in("symbol", symbols);
    if (existingErr) throw new Error(existingErr.message);

    const existingCost = new Map(
      (existing ?? []).map((r) => [r.symbol, r.cost_basis_per_share]),
    );

    const rows = payload.holdings.map((h) => ({
      symbol: h.symbol,
      qty: h.qty,
      cost_basis_per_share:
        h.cost_basis_per_share ?? existingCost.get(h.symbol) ?? null,
    }));

    const { error } = await supabase
      .from("holdings")
      .upsert(rows, { onConflict: "symbol" });
    if (error) throw new Error(error.message);
  }

  if (payload.cash != null) {
    const { error } = await supabase
      .from("cash_position")
      .upsert({ id: 1, amount: payload.cash }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    cashSet = true;
  }

  revalidatePath("/");
  return {
    holdingsUpserted: payload.holdings.length,
    cashSet,
  };
}
