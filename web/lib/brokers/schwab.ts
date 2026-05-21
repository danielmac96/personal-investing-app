/**
 * Schwab "Positions" CSV parser.
 *
 * The export format is forgiving: it usually starts with a few metadata rows
 * ("Positions for individual ...", "Account: ...", maybe blank lines), then
 * the real header (Symbol, Description, Quantity, Price, Market Value, etc.),
 * then per-position rows, then a totals row and sometimes per-account
 * footers. We:
 *
 *   1. Find the header row by looking for "Symbol" + a quantity column.
 *   2. Map columns by header name (case-insensitive, with aliases).
 *   3. Per row, normalise symbols, parse currency/percent fields, and skip
 *      totals/footer rows.
 *   4. Pull cash out of the "Cash & Cash Investments" row (or similar) into a
 *      separate field; we never store cash as a holding.
 *
 * Future broker integrations: implement the same `BrokerImportResult`
 * interface, and the dashboard upload handler can dispatch by detected
 * format.
 */

import type { Holding } from "@/lib/portfolio";

export type ImportedHolding = Holding & {
  marketValue: number | null;
  csvPctOfAcct: number | null;
};

export type BrokerImportResult = {
  holdings: ImportedHolding[];
  cash: number | null;
  asOf: Date | null;
  warnings: string[];
};

export interface BrokerAdapter {
  name: string;
  parse(text: string): BrokerImportResult;
}

const QTY_ALIASES = ["quantity", "qty"];
const SYMBOL_ALIASES = ["symbol"];
const MARKET_VALUE_ALIASES = ["market value", "mkt val", "mkt value"];
const PCT_ACCT_ALIASES = ["% of account", "% of acct", "% acct"];
const COST_TOTAL_ALIASES = ["cost basis", "total cost basis"];
const COST_PER_SHARE_ALIASES = ["cost per share", "cost/share"];
const DESCRIPTION_ALIASES = ["description", "name"];

const CASH_ROW_RE = /cash|money market|sweep|mmf/i;
const SKIP_ROW_RE = /^account total$|^total$|^positions total/i;

function normaliseSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-").replace(/\//g, "-");
}

function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "" || s === "--" || s === "N/A") return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.endsWith("%")) s = s.slice(0, -1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function parsePercent(raw: string | undefined | null): number | null {
  const n = parseNumber(raw);
  return n == null ? null : n / 100;
}

/**
 * Minimal CSV row tokeniser that respects double-quoted fields and embedded
 * commas / escaped quotes. Good enough for broker exports, which are well
 * behaved (no embedded newlines in fields).
 */
function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function findIndex(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

export const schwabAdapter: BrokerAdapter = {
  name: "schwab",
  parse(text: string): BrokerImportResult {
    const warnings: string[] = [];
    const cleaned = text.replace(/^﻿/, "");
    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { holdings: [], cash: null, asOf: null, warnings: ["empty file"] };
    }

    // Extract "as of" date from any leading metadata row that looks like
    //   "Positions for ... as of 12:00 AM ET, 2026/03/12"
    let asOf: Date | null = null;
    const asOfMatch = cleaned.match(
      /as of[^,\n]*?(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    );
    if (asOfMatch) {
      const parsed = new Date(asOfMatch[1].replace(/\//g, "-"));
      if (!Number.isNaN(parsed.getTime())) asOf = parsed;
    }

    // Find header row.
    let headerIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const tokens = splitCsvRow(lines[i]).map((s) => s.toLowerCase());
      const hasSymbol = tokens.some((t) => SYMBOL_ALIASES.includes(t));
      const hasQty = tokens.some((t) => QTY_ALIASES.includes(t));
      if (hasSymbol && hasQty) {
        headerIdx = i;
        headers = splitCsvRow(lines[i]);
        break;
      }
    }
    if (headerIdx === -1) {
      return {
        holdings: [],
        cash: null,
        asOf,
        warnings: ["could not find a header row containing Symbol and Quantity"],
      };
    }

    const symIdx = findIndex(headers, SYMBOL_ALIASES);
    const qtyIdx = findIndex(headers, QTY_ALIASES);
    const descIdx = findIndex(headers, DESCRIPTION_ALIASES);
    const mktValIdx = findIndex(headers, MARKET_VALUE_ALIASES);
    const pctIdx = findIndex(headers, PCT_ACCT_ALIASES);
    const costTotalIdx = findIndex(headers, COST_TOTAL_ALIASES);
    const costPerShareIdx = findIndex(headers, COST_PER_SHARE_ALIASES);

    const holdings: ImportedHolding[] = [];
    let cash: number | null = null;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitCsvRow(lines[i]);
      const rawSym = symIdx !== -1 ? cells[symIdx] ?? "" : "";
      const rawDesc = descIdx !== -1 ? cells[descIdx] ?? "" : "";

      if (!rawSym && !rawDesc) continue;
      if (SKIP_ROW_RE.test(rawSym) || SKIP_ROW_RE.test(rawDesc)) continue;

      // Cash row: Schwab uses no symbol and a description like
      // "Cash & Cash Investments" or "Bank Sweep".
      if (!rawSym || CASH_ROW_RE.test(rawDesc) || CASH_ROW_RE.test(rawSym)) {
        const mv =
          mktValIdx !== -1 ? parseNumber(cells[mktValIdx]) : null;
        if (mv != null) cash = (cash ?? 0) + mv;
        continue;
      }

      const symbol = normaliseSymbol(rawSym);
      if (!symbol || symbol.length > 12) {
        warnings.push(`skipped row with odd symbol: ${rawSym}`);
        continue;
      }

      const qty = qtyIdx !== -1 ? parseNumber(cells[qtyIdx]) : null;
      if (qty == null || qty <= 0) {
        warnings.push(`skipped ${symbol}: no positive quantity`);
        continue;
      }

      const marketValue =
        mktValIdx !== -1 ? parseNumber(cells[mktValIdx]) : null;
      const csvPctOfAcct =
        pctIdx !== -1 ? parsePercent(cells[pctIdx]) : null;

      let costPerShare: number | null =
        costPerShareIdx !== -1
          ? parseNumber(cells[costPerShareIdx])
          : null;
      if (costPerShare == null && costTotalIdx !== -1) {
        const total = parseNumber(cells[costTotalIdx]);
        if (total != null && qty > 0) costPerShare = total / qty;
      }

      holdings.push({
        symbol,
        qty,
        cost_basis_per_share: costPerShare,
        notes: null,
        marketValue,
        csvPctOfAcct,
      });
    }

    return { holdings, cash, asOf, warnings };
  },
};

/**
 * Stub for future Schwab API integration. Phase 1 only.
 * Throwing makes accidental calls visible immediately.
 */
export const schwabApi = {
  async fetchPositions(): Promise<never> {
    throw new Error("Schwab API integration not implemented (Phase 1)");
  },
  async fetchTransactions(): Promise<never> {
    throw new Error("Schwab API integration not implemented (Phase 1)");
  },
};
