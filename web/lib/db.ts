import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { FundamentalsSnapshot, IndicatorSnapshot } from "@/lib/snapshots";

/**
 * Local SQLite database shared with the Python routine.
 *
 * Path resolution: INVESTING_DB_PATH env var wins; otherwise walk up from the
 * web/ working directory to the repo root (identified by db/schema.sql) and
 * use <root>/data/investing.db. The schema script is idempotent and applied
 * on every open, so a fresh checkout works with zero setup.
 */

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, "db", "schema.sql"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate repo root (db/schema.sql). Set INVESTING_DB_PATH.",
  );
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const root = findRepoRoot();
  const dbPath =
    process.env.INVESTING_DB_PATH ?? path.join(root, "data", "investing.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  return db;
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

export function normaliseSymbol(raw: string): string | null {
  const s = decodeURIComponent(raw).trim().toUpperCase().replace(/[/.]/g, "-");
  return SYMBOL_RE.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type HoldingRow = {
  symbol: string;
  qty: number;
  cost_basis_per_share: number | null;
  notes: string | null;
};

export type PriceEodRow = {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

export type NewsRow = {
  id: number;
  headline: string;
  url: string | null;
  published_at: string;
  sentiment: string | null;
  source: string | null;
};

export type EarningsRow = {
  symbol: string;
  report_date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  surprise_pct: number | null;
};

export type RecommendationRow = {
  briefing_date: string;
  symbol: string;
  signal: string;
  confidence: number;
  reasoning: string;
  watch_items: string[] | null;
  thesis_status: string | null;
  indicator_snapshot: IndicatorSnapshot | null;
};

export type BriefingRow = {
  briefing_date: string;
  portfolio_summary: Record<string, unknown>;
};

export type RoutineRunRow = {
  run_type: string;
  run_date: string;
  status: string;
  email_status: string | null;
  error: string | null;
  created_at: string;
};

export type WatchlistRowDb = {
  symbol: string;
  notes: string | null;
  added_at: string;
};

export type ProposalRow = {
  id: number;
  symbol: string;
  proposed_date: string;
  screen_metrics: Record<string, unknown> | null;
  confidence: number | null;
  reasoning: string | null;
};

export type ThesisRow = {
  thesis_text: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getHoldings(): HoldingRow[] {
  return getDb()
    .prepare(
      "SELECT symbol, qty, cost_basis_per_share, notes FROM holdings ORDER BY symbol",
    )
    .all() as HoldingRow[];
}

export function getHolding(symbol: string): HoldingRow | null {
  return (
    (getDb()
      .prepare(
        "SELECT symbol, qty, cost_basis_per_share, notes FROM holdings WHERE symbol = ?",
      )
      .get(symbol) as HoldingRow | undefined) ?? null
  );
}

export function getCash(): number {
  const row = getDb()
    .prepare("SELECT amount FROM cash_position WHERE id = 1")
    .get() as { amount: number } | undefined;
  return Number(row?.amount ?? 0);
}

/** Most recent close rows across all symbols, newest first. */
export function getRecentCloses(limit = 500): Array<{
  symbol: string;
  date: string;
  close: number;
}> {
  return getDb()
    .prepare(
      "SELECT symbol, date, close FROM prices_eod ORDER BY date DESC LIMIT ?",
    )
    .all(limit) as Array<{ symbol: string; date: string; close: number }>;
}

/** OHLCV history for one symbol, newest first. */
export function getPriceHistory(symbol: string, limit: number): PriceEodRow[] {
  return getDb()
    .prepare(
      "SELECT symbol, date, open, high, low, close, volume FROM prices_eod WHERE symbol = ? ORDER BY date DESC LIMIT ?",
    )
    .all(symbol, limit) as PriceEodRow[];
}

export function getLatestFundamentals(symbol: string): {
  snapshot_date: string;
  data: FundamentalsSnapshot;
} | null {
  const row = getDb()
    .prepare(
      "SELECT snapshot_date, data FROM fundamentals_snapshot WHERE symbol = ? ORDER BY snapshot_date DESC LIMIT 1",
    )
    .get(symbol) as { snapshot_date: string; data: string } | undefined;
  if (!row) return null;
  const data = parseJson<FundamentalsSnapshot>(row.data);
  return data ? { snapshot_date: row.snapshot_date, data } : null;
}

export function getNews(symbol: string, limit = 10): NewsRow[] {
  const rows = getDb()
    .prepare(
      "SELECT id, headline, url, published_at, sentiment, source FROM news_items WHERE symbol = ? ORDER BY published_at DESC LIMIT ?",
    )
    .all(symbol, limit) as NewsRow[];
  // url is stored as '' when missing so the UNIQUE key can dedupe.
  return rows.map((r) => ({ ...r, url: r.url || null }));
}

export function getEarnings(symbol: string, limit = 20): EarningsRow[] {
  return getDb()
    .prepare(
      "SELECT symbol, report_date, eps_estimate, eps_actual, surprise_pct FROM earnings_events WHERE symbol = ? ORDER BY report_date DESC LIMIT ?",
    )
    .all(symbol, limit) as EarningsRow[];
}

type RawRecRow = Omit<RecommendationRow, "watch_items" | "indicator_snapshot"> & {
  watch_items: string | null;
  indicator_snapshot: string | null;
};

function hydrateRecommendation(row: RawRecRow): RecommendationRow {
  return {
    ...row,
    watch_items: parseJson<string[]>(row.watch_items),
    indicator_snapshot: parseJson<IndicatorSnapshot>(row.indicator_snapshot),
  };
}

export function getLatestRecommendation(
  symbol: string,
): RecommendationRow | null {
  const row = getDb()
    .prepare(
      "SELECT briefing_date, symbol, signal, confidence, reasoning, watch_items, thesis_status, indicator_snapshot FROM recommendations WHERE symbol = ? ORDER BY briefing_date DESC LIMIT 1",
    )
    .get(symbol) as RawRecRow | undefined;
  return row ? hydrateRecommendation(row) : null;
}

export function getTopRecommendations(
  briefingDate: string,
  limit = 3,
): RecommendationRow[] {
  const rows = getDb()
    .prepare(
      "SELECT briefing_date, symbol, signal, confidence, reasoning, watch_items, thesis_status, indicator_snapshot FROM recommendations WHERE briefing_date = ? ORDER BY confidence DESC LIMIT ?",
    )
    .all(briefingDate, limit) as RawRecRow[];
  return rows.map(hydrateRecommendation);
}

export function getLatestBriefing(): BriefingRow | null {
  const row = getDb()
    .prepare(
      "SELECT briefing_date, portfolio_summary FROM daily_briefings ORDER BY briefing_date DESC LIMIT 1",
    )
    .get() as { briefing_date: string; portfolio_summary: string } | undefined;
  if (!row) return null;
  return {
    briefing_date: row.briefing_date,
    portfolio_summary:
      parseJson<Record<string, unknown>>(row.portfolio_summary) ?? {},
  };
}

export function getLatestRun(): RoutineRunRow | null {
  return (
    (getDb()
      .prepare(
        "SELECT run_type, run_date, status, email_status, error, created_at FROM routine_runs ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get() as RoutineRunRow | undefined) ?? null
  );
}

export function getThesis(symbol: string): ThesisRow | null {
  return (
    (getDb()
      .prepare("SELECT thesis_text, updated_at FROM theses WHERE symbol = ?")
      .get(symbol) as ThesisRow | undefined) ?? null
  );
}

export function getWatchlist(): WatchlistRowDb[] {
  return getDb()
    .prepare("SELECT symbol, notes, added_at FROM watchlist ORDER BY symbol")
    .all() as WatchlistRowDb[];
}

export function getPendingProposals(): ProposalRow[] {
  const rows = getDb()
    .prepare(
      "SELECT id, symbol, proposed_date, screen_metrics, confidence, reasoning FROM watchlist_proposals WHERE status = 'pending' ORDER BY confidence DESC",
    )
    .all() as Array<Omit<ProposalRow, "screen_metrics"> & { screen_metrics: string | null }>;
  return rows.map((r) => ({
    ...r,
    screen_metrics: parseJson<Record<string, unknown>>(r.screen_metrics),
  }));
}

// ---------------------------------------------------------------------------
// Writes (called from Server Actions)
// ---------------------------------------------------------------------------

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

export function upsertThesis(symbol: string, text: string): string {
  const row = getDb()
    .prepare(
      `INSERT INTO theses (symbol, thesis_text) VALUES (?, ?)
       ON CONFLICT (symbol) DO UPDATE
         SET thesis_text = excluded.thesis_text, updated_at = ${NOW}
       RETURNING updated_at`,
    )
    .get(symbol, text) as { updated_at: string };
  return row.updated_at;
}

export function deleteThesis(symbol: string): void {
  getDb().prepare("DELETE FROM theses WHERE symbol = ?").run(symbol);
}

export function upsertWatchlistSymbol(
  symbol: string,
  notes: string | null,
): void {
  getDb()
    .prepare(
      `INSERT INTO watchlist (symbol, notes) VALUES (?, ?)
       ON CONFLICT (symbol) DO UPDATE
         SET notes = excluded.notes, updated_at = ${NOW}`,
    )
    .run(symbol, notes);
}

export function deleteWatchlistSymbol(symbol: string): void {
  getDb().prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol);
}

export function setProposalStatus(
  id: number,
  status: "approved" | "dismissed",
): void {
  getDb()
    .prepare("UPDATE watchlist_proposals SET status = ? WHERE id = ?")
    .run(status, id);
}

export function importHoldingsAndCash(
  holdings: Array<{
    symbol: string;
    qty: number;
    cost_basis_per_share: number | null;
  }>,
  cash: number | null,
): void {
  const d = getDb();
  // Preserve an existing cost basis when the new CSV doesn't carry one.
  const upsert = d.prepare(
    `INSERT INTO holdings (symbol, qty, cost_basis_per_share) VALUES (?, ?, ?)
     ON CONFLICT (symbol) DO UPDATE SET
       qty = excluded.qty,
       cost_basis_per_share = coalesce(excluded.cost_basis_per_share, holdings.cost_basis_per_share),
       updated_at = ${NOW}`,
  );
  const setCash = d.prepare(
    `INSERT INTO cash_position (id, amount) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET amount = excluded.amount, updated_at = ${NOW}`,
  );
  d.transaction(() => {
    for (const h of holdings) {
      upsert.run(h.symbol, h.qty, h.cost_basis_per_share);
    }
    if (cash != null) setCash.run(cash);
  })();
}
