"""First Claude Slice1 close-only watchdog. No activation, credentials or business writes."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import stat
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[4]
GATE = '530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'
CLOSED = 'b0f7eae14599bd32cb9430a59832c837'
CLIENT = 'd2b8167f-ee42-4ac1-b5ef-4dc003c0d141'
POLICY = 'OTR_MCP_OAUTH_WRITE_QA_20261101_V1'
def sha(value): return hashlib.sha256(value).hexdigest()
def instant(value):
    if not isinstance(value,str) or not value.endswith('Z'): raise ValueError('UTC_REQUIRED')
    return dt.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def validate(plan, directory):
    if set(plan) != {'gateSHA256','windowId','clientId','startsAt','expiresAt','activeSQLSHA256','closeSQLSHA256','activeBodyMD5'}: raise ValueError('EXACT_PLAN_REQUIRED')
    if plan['gateSHA256'] != GATE or plan['clientId'] != CLIENT or not re.fullmatch('[0-9a-f]{32}',plan['windowId']): raise ValueError('FIRST_CLAUDE_GATE_REQUIRED')
    if directory != Path('/private/tmp/otr-auth-mcp-slice1-'+plan['windowId']) or directory.is_symlink() or directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077: raise ValueError('PRIVATE_DIRECTORY_REQUIRED')
    start,end=instant(plan['startsAt']),instant(plan['expiresAt'])
    if not 0 < end-start <= 1800: raise ValueError('FINITE_WINDOW_REQUIRED')
    spec=importlib.util.spec_from_file_location('existing_write_hook',ROOT/'scripts/auth/render-mcp-write-qa-hook.py')
    renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
    active=renderer.render(CLIENT,plan['expiresAt'],plan['startsAt']);closed=renderer.render_close(active)
    if sha(active.encode()) != plan['activeSQLSHA256'] or sha(closed.encode()) != plan['closeSQLSHA256'] or hashlib.md5(active.split('$hook$')[1].encode()).hexdigest() != plan['activeBodyMD5']: raise ValueError('FROZEN_RENDER_REQUIRED')
    return end,closed

def close_once(plan,directory,sql):
    _,closed=validate(plan,directory)
    query="BEGIN READ ONLY;SELECT md5(prosrc) AS body FROM pg_proc WHERE oid=to_regprocedure('public.otr_mcp_qa_access_token(jsonb)') AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'];COMMIT;"
    rows=sql(query)['rows']
    if rows not in [[{'body':CLOSED}],[{'body':plan['activeBodyMD5']}]]: raise ValueError('HOOK_PREIMAGE_DRIFT')
    intent=directory/'issuer-close-intent.json'
    if rows != [{'body':CLOSED}] and not intent.exists():
        with intent.open('x') as f:
            os.chmod(intent,0o600);json.dump({'disposition':'NOT_SENT'},f);f.flush();os.fsync(f.fileno())
        parent=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try: os.fsync(parent)
        finally: os.close(parent)
        try:
            sql("SET otr.auth.approved_project_ref='tuqigdxrvrerfewsxqgm';SET otr.auth.mcp_qa_gate='"+POLICY+"';"+closed)
            disposition='ACKNOWLEDGED'
        except Exception: disposition='UNKNOWN_NO_REAPPLY'
        intent.write_text(json.dumps({'disposition':disposition})+'\n')
    proven=sql(query)['rows']==[{'body':CLOSED}]
    result={'status':'ISSUER_DENY_ALL_VERIFIED' if proven else 'ISSUER_CLOSE_UNKNOWN_RECONCILE_READ_ONLY','windowId':plan['windowId'],'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'issuerClosed':proven}
    target=directory/'issuer-close-result.json';target.write_text(json.dumps(result)+'\n');os.chmod(target,0o600)
    return result

if __name__=='__main__':
    directory=Path(sys.argv[1]);planfile=directory/'issuer-plan.json';info=planfile.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size>8192: raise ValueError('PRIVATE_PLAN_REQUIRED')
    raw=planfile.read_bytes()
    if sha(raw) != sys.argv[2]: raise ValueError('PLAN_SHA_REQUIRED')
    plan=json.loads(raw);deadline,_=validate(plan,directory)
    if len(sys.argv)==4 and sys.argv[3]=='--watch':
        while time.time() < deadline-120 and not (directory/'CLOSE').exists(): time.sleep(min(10,max(.1,deadline-120-time.time())))
    elif not (directory/'CLOSE').exists() and time.time()<deadline-120: raise ValueError('EARLY_CLOSE_INTENTION_REQUIRED')
    sys.path.insert(0,str(ROOT/'scripts/import'))
    from universal_scope_close import SqlTransport
    transport=SqlTransport(str(ROOT/'node_modules/.bin/supabase'),str(ROOT),str(directory))
    print(json.dumps(close_once(plan,directory,transport)))
