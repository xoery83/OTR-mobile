"""Render only. Never connects to DEV, registers a client or executes SQL."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

TEMPLATE = Path(__file__).resolve().parents[2] / "docs/ops/auth-mcp-oauth-20261031/QA_TOKEN_HOOK_INSTALL.template.sql"
CLOSED_INSTALL = TEMPLATE.with_name("QA_TOKEN_HOOK_CLOSED_INSTALL.sql")


def closed_body():
    return CLOSED_INSTALL.read_text().split("$hook$")[1]


def render(client_id: str, deadline: str) -> str:
    client = str(UUID(client_id))
    instant = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    if instant.tzinfo is None or instant.utcoffset().total_seconds() != 0:
        raise ValueError("UTC_DEADLINE_REQUIRED")
    text = instant.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return TEMPLATE.read_text().replace("__CLIENT_UUID__", client).replace("__DEADLINE_UTC__", text).replace(
        "__CLOSED_BODY_MD5__", hashlib.md5(closed_body().encode()).hexdigest())


def render_close(active_sql):
    active_md5 = hashlib.md5(active_sql.split("$hook$")[1].encode()).hexdigest()
    return """BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
DO $gate$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.mcp_qa_gate',true) IS DISTINCT FROM 'OTR_MCP_OAUTH_QA_20261031_V1'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.otr_mcp_qa_access_token(jsonb)')
 AND md5(prosrc) IN ('""" + active_md5 + "','" + hashlib.md5(closed_body().encode()).hexdigest() + """')
 AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
 THEN RAISE EXCEPTION 'MCP_QA_CLOSE_CAS_REQUIRED';END IF;
END $gate$;
CREATE OR REPLACE FUNCTION public.otr_mcp_qa_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $hook$""" + closed_body() + "$hook$;\nCOMMIT;\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--deadline-utc", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rendered = render(args.client_id, args.deadline_utc)
    with args.output.open("x", encoding="utf8") as output:
        args.output.chmod(0o600)
        output.write(rendered)
    close_path = args.output.with_suffix(".close.sql")
    with close_path.open("x", encoding="utf8") as output:
        close_path.chmod(0o600)
        output.write(render_close(rendered))
    print(json.dumps({"status": "RENDERED_ONLY_NOT_AUTHORIZED_OR_EXECUTED",
                      "templateSHA256": hashlib.sha256(TEMPLATE.read_bytes()).hexdigest(),
                      "sqlSHA256": hashlib.sha256(rendered.encode()).hexdigest()}))
