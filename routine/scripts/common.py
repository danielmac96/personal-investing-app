"""Shared helpers for the daily routine scripts."""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

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
