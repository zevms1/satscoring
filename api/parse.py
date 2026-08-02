"""
Vercel Python Function: POST /api/parse

Called by app/upload/actions.ts right after the two source files are
uploaded to Supabase Storage. Downloads them back down, runs sat_parser.py's
build_report(), and writes the results into attempts / domain_results /
skill_results using the Supabase service_role key (bypasses RLS entirely --
this is a trusted backend job, not a user-facing endpoint).

Auth: a shared secret header (INTERNAL_API_SECRET), not Supabase Auth --
this function is only ever meant to be called by our own Server Action.
"""
import json
import os
import tempfile
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

import requests

from sat_parser import build_report

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "")

REST_HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

# Parser section keys ("RW" / "MA") -> nothing needed here; domain_code and
# skill_code alone identify which section a row belongs to via the domains
# table, so we just iterate both parser sections into the same tables.
PARSER_SECTIONS = ("RW", "MA")


def _rest_get(path, params):
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=REST_HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _rest_patch(path, params, body):
    resp = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=REST_HEADERS, params=params, json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _rest_upsert(path, rows, on_conflict):
    headers = {**REST_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": on_conflict},
        json=rows,
        timeout=30,
    )
    resp.raise_for_status()


def _download_storage_object(path, dest):
    resp = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/attempt-files/{path}",
        headers={"Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        timeout=60,
    )
    resp.raise_for_status()
    with open(dest, "wb") as f:
        f.write(resp.content)


def _upload_storage_object(path, content_bytes, content_type):
    resp = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/attempt-files/{path}",
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=content_bytes,
        timeout=60,
    )
    resp.raise_for_status()


def _mark_failed(attempt_id, message):
    try:
        _rest_patch(
            "attempts",
            {"id": f"eq.{attempt_id}"},
            {"status": "failed", "error_message": str(message)[:500]},
        )
    except Exception:
        pass  # best-effort -- don't let a failure to report failure crash the handler


def process_attempt(attempt_id):
    rows = _rest_get("attempts", {"id": f"eq.{attempt_id}", "select": "*"})
    if not rows:
        raise ValueError(f"attempt {attempt_id} not found")
    attempt = rows[0]

    with tempfile.TemporaryDirectory() as tmp:
        html_path = os.path.join(tmp, "details.html")
        pdf_path = os.path.join(tmp, "score_report.pdf")
        _download_storage_object(attempt["source_html_path"], html_path)
        _download_storage_object(attempt["source_pdf_path"], pdf_path)

        report = build_report(html_path, pdf_path)

    summary = report["summary"]
    raw = summary["raw_scores"]
    scaled = summary["scaled_scores"]

    # 1. Update the attempt row with top-line scores.
    _rest_patch(
        "attempts",
        {"id": f"eq.{attempt_id}"},
        {
            "rw_correct": raw["reading_and_writing"]["correct"],
            "rw_incorrect": raw["reading_and_writing"]["incorrect"],
            "rw_omitted": raw["reading_and_writing"]["omitted"],
            "rw_scaled": scaled["reading_and_writing"],
            "math_correct": raw["math"]["correct"],
            "math_incorrect": raw["math"]["incorrect"],
            "math_omitted": raw["math"]["omitted"],
            "math_scaled": scaled["math"],
            "form_code": report["diagnostics"].get("form_code"),
            "status": "completed",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    # 2. domain_results -- one row per domain across both parser sections.
    domain_rows = []
    for section in PARSER_SECTIONS:
        for domain_code, d in summary["domain_level_analysis"].get(section, {}).items():
            domain_rows.append(
                {
                    "attempt_id": attempt_id,
                    "domain_code": domain_code,
                    "correct": d["correct"],
                    "incorrect": d["incorrect"],
                    "omitted": d["omitted"],
                }
            )
    if domain_rows:
        _rest_upsert("domain_results", domain_rows, on_conflict="attempt_id,domain_code")

    # 3. skill_results -- one row per skill across both parser sections.
    skill_rows = []
    for section in PARSER_SECTIONS:
        for skill_code, s in summary["skill_level_analysis"].get(section, {}).items():
            skill_rows.append(
                {
                    "attempt_id": attempt_id,
                    "skill_code": skill_code,
                    "correct": s["correct"],
                    "incorrect": s["incorrect"],
                    "omitted": s["omitted"],
                }
            )
    if skill_rows:
        _rest_upsert("skill_results", skill_rows, on_conflict="attempt_id,skill_code")

    # 4. Save the full raw report (summary + per-question detail +
    # diagnostics) to Storage for future use (e.g. a rendered report view),
    # and record where it landed.
    report_path = f"{attempt['student_id']}/{attempt_id}/report.json"
    _upload_storage_object(report_path, json.dumps(report).encode("utf-8"), "application/json")
    _rest_patch("attempts", {"id": f"eq.{attempt_id}"}, {"report_json_path": report_path})


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.headers.get("x-internal-secret") != INTERNAL_SECRET or not INTERNAL_SECRET:
            self._respond(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        attempt_id = body.get("attempt_id")

        if not attempt_id:
            self._respond(400, {"error": "attempt_id is required"})
            return

        try:
            process_attempt(attempt_id)
            self._respond(200, {"ok": True})
        except Exception as exc:  # noqa: BLE001 -- report every failure back to the row
            traceback.print_exc()
            _mark_failed(attempt_id, exc)
            self._respond(500, {"error": str(exc)})

    def _respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
