"use server";

import { revalidatePath } from "next/cache";

import { importHoldingsAndCash } from "@/lib/db";

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
  if (payload.holdings.length === 0 && payload.cash == null) {
    throw new Error("Nothing to import.");
  }

  importHoldingsAndCash(payload.holdings, payload.cash);

  revalidatePath("/");
  return {
    holdingsUpserted: payload.holdings.length,
    cashSet: payload.cash != null,
  };
}
