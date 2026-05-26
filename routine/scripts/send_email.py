"""Send the morning summary email via Resend.

Reads routine/data/briefing-<date>.json + computes a < 200-word HTML body.

Env vars: RESEND_API_KEY, EMAIL_TO, EMAIL_FROM, NEXT_PUBLIC_SITE_URL
(SITE_URL falls back to https://example.com if unset — the email still
sends; the links just won't work.)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

from common import load_env, record_run, require_env, supabase_client


def usd(value):
    if value is None:
        return "—"
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.2f}"


def pct_signed(value):
    if value is None:
        return "—"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value * 100:.2f}%"


def build_email(briefing: dict, site_url: str) -> tuple[str, str, str]:
    summary = briefing["portfolio_summary"]
    bd = briefing["briefing_date"]
    total = summary.get("total_value")
    change_pct = summary.get("day_change_pct")
    change_val = summary.get("day_change_value")
    watch = (summary.get("top_watch_items") or [])[:3]

    subject = f"Briefing {bd} · {usd(total)} ({pct_signed(change_pct)})"

    items_html = "".join(
        f"""
        <li style="margin-bottom:6px;">
          <a href="{site_url}/stocks/{w['symbol']}"
             style="color:#0f172a;text-decoration:none;font-weight:600;">
            {w['symbol']}
          </a>
          <span style="color:#475569;"> · {w.get('signal','—')} · conf {w.get('confidence','?')}/10</span>
          <div style="color:#475569;font-size:13px;margin-top:2px;">{w.get('reasoning','')}</div>
        </li>
        """
        for w in watch
    ) or '<li style="color:#475569;">Nothing pressing — sit on your hands.</li>'

    html = f"""<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:16px;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
    <div style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;">Briefing · {bd}</div>
    <div style="font-size:24px;font-weight:600;margin-top:4px;">{usd(total)}
      <span style="font-size:14px;font-weight:500;color:{'#047857' if (change_pct or 0) > 0 else ('#9f1239' if (change_pct or 0) < 0 else '#475569')};">
        {pct_signed(change_pct)} {f'({usd(change_val)})' if change_val is not None else ''}
      </span>
    </div>
    <div style="margin-top:14px;font-size:13px;color:#64748b;">Top 3 watch items</div>
    <ul style="padding-left:18px;margin:8px 0 0 0;font-size:14px;">{items_html}</ul>
    <div style="margin-top:18px;text-align:center;">
      <a href="{site_url}/" style="color:#0f172a;font-size:13px;">Open dashboard →</a>
    </div>
    <div style="margin-top:18px;font-size:11px;color:#94a3b8;text-align:center;">
      Information, not financial advice.
    </div>
  </div>
</body></html>"""
    text = (
        f"Briefing {bd} — {usd(total)} ({pct_signed(change_pct)})\n\n"
        + "\n".join(
            f"- {w['symbol']} ({w.get('signal','—')}, conf {w.get('confidence','?')}/10): {w.get('reasoning','')}"
            for w in watch
        )
        + f"\n\nDashboard: {site_url}/\n\nInformation, not financial advice."
    )
    return subject, html, text


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: send_email.py <briefing.json>", file=sys.stderr)
        return 2
    load_env()
    briefing_path = Path(sys.argv[1])
    with briefing_path.open() as f:
        briefing = json.load(f)

    api_key = require_env("RESEND_API_KEY")
    to_email = require_env("EMAIL_TO")
    from_email = os.environ.get("EMAIL_FROM") or "onboarding@resend.dev"
    site_url = (
        os.environ.get("NEXT_PUBLIC_SITE_URL")
        or os.environ.get("SITE_URL")
        or "https://example.com"
    ).rstrip("/")

    subject, html, text = build_email(briefing, site_url)
    briefing_date = briefing.get("briefing_date")
    run_summary = {
        "total_value": briefing.get("portfolio_summary", {}).get("total_value"),
        "recommendations": len(briefing.get("recommendations") or []),
        "subject": subject,
    }

    # Records a routine_runs row regardless of outcome, so an undelivered
    # email is always visible on the dashboard. Best-effort — never masks
    # the email result.
    client = None
    try:
        client = supabase_client()
    except SystemExit:
        client = None  # missing Supabase env shouldn't block the email itself

    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html,
                "text": text,
            },
            timeout=30,
        )
    except requests.RequestException as e:
        if client is not None:
            record_run(
                client,
                run_type="daily_briefing",
                status="partial",
                run_date=briefing_date,
                email_status="failed",
                summary=run_summary,
                error=f"request error: {e}",
            )
        print(f"Resend request failed: {e}", file=sys.stderr)
        return 1

    if not resp.ok:
        if client is not None:
            record_run(
                client,
                run_type="daily_briefing",
                status="partial",
                run_date=briefing_date,
                email_status="failed",
                summary=run_summary,
                error=f"resend {resp.status_code}: {resp.text[:500]}",
            )
        print(f"Resend error {resp.status_code}: {resp.text}", file=sys.stderr)
        return 1

    if client is not None:
        record_run(
            client,
            run_type="daily_briefing",
            status="success",
            run_date=briefing_date,
            email_status="sent",
            summary=run_summary,
        )
    print(json.dumps(resp.json(), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
