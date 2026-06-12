"""Shared helpers for the daily routine scripts."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, TypeVar

try:
    from dotenv import load_dotenv
except ImportError:  # dotenv is optional
    load_dotenv = None  # type: ignore[assignment]

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO_ROOT / "db" / "schema.sql"
DEFAULT_DB_PATH = REPO_ROOT / "data" / "investing.db"


def load_env() -> None:
    """Load .env from the repo root if python-dotenv is installed."""
    if load_dotenv is not None:
        load_dotenv(REPO_ROOT / ".env", override=False)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"ERROR: environment variable {name} is required", file=sys.stderr)
        sys.exit(2)
    return value


def db() -> sqlite3.Connection:
    """Open the shared local SQLite database (same file the web app reads).

    The schema script is idempotent and applied on every open, so a fresh
    checkout works without a separate migration step. Rows come back as
    sqlite3.Row, which supports dict-style access.
    """
    db_path = Path(os.environ.get("INVESTING_DB_PATH") or DEFAULT_DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_run(
    conn: sqlite3.Connection,
    *,
    run_type: str,
    status: str,
    run_date: str | None = None,
    email_status: str | None = None,
    summary: dict | None = None,
    error: str | None = None,
) -> None:
    """Insert a routine_runs row. Best-effort: never raises — a logging
    failure must not mask the original outcome it's trying to record."""
    try:
        with conn:
            conn.execute(
                """INSERT INTO routine_runs
                   (run_type, run_date, status, email_status, summary, error)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    run_type,
                    run_date or briefing_date_str(),
                    status,
                    email_status,
                    json.dumps(summary) if summary is not None else None,
                    error,
                ),
            )
    except Exception as e:  # noqa: BLE001
        print(f"WARN: failed to record routine_run: {e}", file=sys.stderr)


def briefing_date_str() -> str:
    """The date to label this briefing with — today's local date."""
    return date.today().isoformat()


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def snapshot_path(name: str, day: str | None = None) -> Path:
    day = day or briefing_date_str()
    return ensure_data_dir() / f"{name}-{day}.json"


T = TypeVar("T")


def retry(
    fn: Callable[[], T],
    *,
    attempts: int = 4,
    base_delay: float = 2.0,
    label: str = "operation",
) -> T:
    """Run fn() with exponential backoff (2s, 4s, 8s, ...).

    yfinance throttles inconsistently and Yahoo occasionally returns empty
    payloads; a couple of retries clears most transient failures. Re-raises
    the last exception if every attempt fails.
    """
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — yfinance raises bare Exceptions
            last_exc = e
            if i == attempts - 1:
                break
            delay = base_delay * (2 ** i)
            print(
                f"  {label} failed (attempt {i + 1}/{attempts}): {e}; "
                f"retrying in {delay:.0f}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
