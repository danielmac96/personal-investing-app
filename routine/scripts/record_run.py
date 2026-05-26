"""Record a routine_runs row from the command line.

Used by routines that don't send email (e.g. the weekly screen) to log a
success/failure heartbeat the dashboard can surface.

Examples:
  python record_run.py --type weekly_screen --status success \
      --summary '{"passed": 3, "proposals": 3}'
  python record_run.py --type weekly_screen --status failed \
      --error "screener crashed: ..."
"""

from __future__ import annotations

import argparse
import json
import sys

from common import load_env, record_run, supabase_client


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", required=True, dest="run_type")
    parser.add_argument("--status", required=True)
    parser.add_argument("--run-date", default=None)
    parser.add_argument("--email-status", default=None)
    parser.add_argument("--error", default=None)
    parser.add_argument("--summary", default=None, help="inline JSON object")
    args = parser.parse_args()

    summary = None
    if args.summary:
        try:
            summary = json.loads(args.summary)
        except json.JSONDecodeError as e:
            print(f"invalid --summary JSON: {e}", file=sys.stderr)
            return 2

    load_env()
    client = supabase_client()
    record_run(
        client,
        run_type=args.run_type,
        status=args.status,
        run_date=args.run_date,
        email_status=args.email_status,
        summary=summary,
        error=args.error,
    )
    print("recorded routine_run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
