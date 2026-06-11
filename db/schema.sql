-- =============================================================================
-- Personal Investing App — local SQLite schema
--
-- Single source of truth for both readers/writers:
--   * web/lib/db.ts            (Next.js app, better-sqlite3)
--   * routine/scripts/common.py (daily routine, stdlib sqlite3)
--
-- The whole script is idempotent (CREATE ... IF NOT EXISTS) and is executed
-- on every connection open, so there is no separate migration step: edit this
-- file additively and the next open picks it up.
--
-- Conventions:
--   * dates are TEXT 'YYYY-MM-DD'; timestamps are TEXT ISO-8601 UTC
--   * JSON payloads (snapshots, summaries) are TEXT containing JSON
-- =============================================================================

PRAGMA journal_mode = WAL;

-- ---------------------------------------------------------------------------
-- User-maintained tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS holdings (
  symbol                TEXT PRIMARY KEY,
  qty                   REAL NOT NULL CHECK (qty >= 0),
  cost_basis_per_share  REAL,
  notes                 TEXT,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
  symbol      TEXT PRIMARY KEY,
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  notes       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS theses (
  symbol       TEXT PRIMARY KEY,
  thesis_text  TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS cash_position (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  amount      REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------------
-- Routine-written tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prices_eod (
  symbol  TEXT NOT NULL,
  date    TEXT NOT NULL,
  open    REAL,
  high    REAL,
  low     REAL,
  close   REAL NOT NULL,
  volume  INTEGER,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS prices_eod_symbol_date_desc
  ON prices_eod (symbol, date DESC);

CREATE TABLE IF NOT EXISTS fundamentals_snapshot (
  symbol         TEXT NOT NULL,
  snapshot_date  TEXT NOT NULL,
  data           TEXT NOT NULL,           -- JSON: FundamentalsSnapshot
  PRIMARY KEY (symbol, snapshot_date)
);

CREATE INDEX IF NOT EXISTS fundamentals_snapshot_symbol_date_desc
  ON fundamentals_snapshot (symbol, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS news_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol        TEXT NOT NULL,
  headline      TEXT NOT NULL,
  url           TEXT NOT NULL DEFAULT '', -- '' (not NULL) so the UNIQUE key dedupes url-less items
  published_at  TEXT NOT NULL,
  sentiment     TEXT,
  source        TEXT,
  UNIQUE (symbol, url, published_at)
);

CREATE INDEX IF NOT EXISTS news_items_symbol_published_desc
  ON news_items (symbol, published_at DESC);

CREATE TABLE IF NOT EXISTS earnings_events (
  symbol        TEXT NOT NULL,
  report_date   TEXT NOT NULL,
  eps_estimate  REAL,
  eps_actual    REAL,
  surprise_pct  REAL,
  PRIMARY KEY (symbol, report_date)
);

CREATE TABLE IF NOT EXISTS daily_briefings (
  briefing_date      TEXT PRIMARY KEY,
  portfolio_summary  TEXT NOT NULL,       -- JSON
  raw_payload        TEXT,                -- JSON, kept for audit
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS recommendations (
  briefing_date       TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  signal              TEXT NOT NULL,
  confidence          INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 10),
  reasoning           TEXT NOT NULL,
  watch_items         TEXT,               -- JSON array
  thesis_status       TEXT,               -- INTACT | STRAINED | BROKEN
  indicator_snapshot  TEXT,               -- JSON: IndicatorSnapshot
  PRIMARY KEY (briefing_date, symbol)
);

CREATE INDEX IF NOT EXISTS recommendations_symbol_date_desc
  ON recommendations (symbol, briefing_date DESC);

CREATE TABLE IF NOT EXISTS watchlist_proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol          TEXT NOT NULL,
  proposed_date   TEXT NOT NULL,
  screen_metrics  TEXT,                   -- JSON
  confidence      INTEGER CHECK (confidence BETWEEN 1 AND 10),
  reasoning       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'dismissed')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (symbol, proposed_date)
);

CREATE INDEX IF NOT EXISTS watchlist_proposals_status_date
  ON watchlist_proposals (status, proposed_date DESC);

CREATE TABLE IF NOT EXISTS routine_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type      TEXT NOT NULL,            -- 'daily_briefing' | 'weekly_screen'
  run_date      TEXT NOT NULL,
  status        TEXT NOT NULL,            -- 'success' | 'partial' | 'failed'
  email_status  TEXT,                     -- 'sent' | 'failed' | 'skipped' | NULL
  summary       TEXT,                     -- JSON
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS routine_runs_created_desc
  ON routine_runs (created_at DESC);
