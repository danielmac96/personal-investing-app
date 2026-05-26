"""Shared helpers for the daily routine scripts."""

from __future__ import annotations

import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, TypeVar

try:
    from dotenv import load_dotenv
except ImportError:  # dotenv is optional in the cloud routine
    load_dotenv = None  # type: ignore[assignment]

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_env() -> None:
    """Load .env from the repo root if python-dotenv is installed.

    In the cloud routine env vars are injected directly, so this is a no-op.
    """
    if load_dotenv is not None:
        repo_root = Path(__file__).resolve().parent.parent.parent
        load_dotenv(repo_root / ".env", override=False)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"ERROR: environment variable {name} is required", file=sys.stderr)
        sys.exit(2)
    return value


def supabase_client():
    """Return a Supabase client authenticated with the service-role key."""
    from supabase import create_client

    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_run(
    client,
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
        client.table("routine_runs").insert({
            "run_type": run_type,
            "run_date": run_date or briefing_date_str(),
            "status": status,
            "email_status": email_status,
            "summary": summary,
            "error": error,
        }).execute()
    except Exception as e:  # noqa: BLE001
        print(f"WARN: failed to record routine_run: {e}", file=sys.stderr)


def briefing_date_str() -> str:
    """The date to label this briefing with — today's UTC date is fine.

    The scheduler triggers at 06:30 ET, well into UTC today.
    """
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
