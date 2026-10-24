#!/usr/bin/env python3
"""Exact finite Universal closure only. No activation, business rows or global gates."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid

ROLES={'otr_trip_source_command_gateway','otr_external_integration_call_gateway'}
SOURCE={'singleton','actor_id','trip_id','batch_id','task_id','run_id','submission_sha256','input_sha256','starts_at','expires_at','source_command_pins'}
PROVIDER={'singleton','actor_id','trip_id','batch_id','task_id','attempt_id','call_id','integration_id','provider_config_id','price_schedule_id','request_sha256','provider_request_sha256','input_sha256','model_binding','input_ceiling','output_ceiling','max_cost_nanos','starts_at','expires_at'}

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def instant(value):
    if not isinstance(value,str) or not value.endswith('Z'):raise ValueError('UTC_REQUIRED')
    return dt.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def uid(value):
    if str(uuid.UUID(value))!=value:raise ValueError('EXACT_UUID_REQUIRED')
def digest(value):
    if not isinstance(value,str) or not re.fullmatch('[0-9a-f]{64}',value):raise ValueError('SHA_REQUIRED')
def quote(value):return "'"+str(value).replace("'","''")+"'"
def validate(plan):
    if plan['version']!=1 or plan['project']!='tuqigdxrvrerfewsxqgm':raise ValueError('DEV_ONLY')
    start,end=instant(plan['startsAt']),instant(plan['expiresAt'])
    if not 0<end-start<=900:raise ValueError('FINITE_WINDOW_REQUIRED')
    s,p=plan['sourceScope'],plan['providerScope']
    if set(s)!=SOURCE or set(p)!=PROVIDER:raise ValueError('EXACT_SCOPE_COLUMNS_REQUIRED')
    for row in [s,p]:
        if row['singleton'] is not True:raise ValueError('EXACT_SINGLETON_REQUIRED')
        if row['starts_at']!=plan['startsAt'] or row['expires_at']!=plan['expiresAt']:raise ValueError('SCOPE_WINDOW_MISMATCH')
        for key in ['actor_id','trip_id','batch_id','task_id']:uid(row[key])
        for key,value in row.items():
            if key.endswith('sha256'):digest(value)
    for key in ['actor_id','trip_id','batch_id','task_id']:
        if s[key]!=p[key]:raise ValueError('SOURCE_PROVIDER_IDENTITY_MISMATCH')
    for key in ['run_id']:uid(s[key])
    for key in ['attempt_id','call_id','provider_config_id','price_schedule_id']:uid(p[key])
    if not isinstance(s['source_command_pins'],list) or not 1<=len(s['source_command_pins'])<=64:raise ValueError('SOURCE_COMMAND_PINS_REQUIRED')
    seen={k:set() for k in ['sourceId','operationId','operationKey','representationId']}
    for pin in s['source_command_pins']:
        if set(pin)!={'profile','actorId','tripId','sourceId','operationId','operationKey','operationSha256','representationId'} or pin['profile'] not in ['OTR_UTF8_TEXT_FILE_V1','OTR_SUBMITTED_TEXT_V1'] or pin['actorId']!=s['actor_id'] or pin['tripId']!=s['trip_id']:raise ValueError('EXACT_SOURCE_COMMAND_PIN')
        for key in ['sourceId','operationId','representationId']:uid(pin[key])
        digest(pin['operationSha256'])
        if not re.fullmatch('[A-Za-z0-9._:-]{1,128}',pin['operationKey']):raise ValueError('OPERATION_KEY')
        for key in seen:
            if pin[key] in seen[key]:raise ValueError('SOURCE_COMMAND_PIN_REUSED')
            seen[key].add(pin[key])
    if not isinstance(p['model_binding'],dict) or not 0<int(p['max_cost_nanos'])<=1000000000:raise ValueError('PROVIDER_BINDING_REQUIRED')
    if not 0<int(p['output_ceiling'])<=4096 or not 0<int(p['input_ceiling'])<=36864:raise ValueError('PROVIDER_LIMITS')
    if not isinstance(plan['temporaryRoles'],list) or len(plan['temporaryRoles'])>2:raise ValueError('EXACT_TEMP_ROLES_REQUIRED')
    names=[]
    for role in plan['temporaryRoles']:
        if set(role)!={'name','priorCanLogin'} or role['name'] not in ROLES or role['priorCanLogin'] is not False:raise ValueError('SHARED_OR_PRIOR_ACTIVE_ROLE_FORBIDDEN')
        names.append(role['name'])
    if len(set(names))!=len(names):raise ValueError('ROLE_REUSED')
    expected={'universal_scope_close.py','universal_runtime_close.py','universal_watchdog.py'}
    if set(plan['helperHashes'])!=expected:raise ValueError('FIXED_HELPERS_REQUIRED')
    for name,h in plan['helperHashes'].items():
        digest(h)
        path=Path(__file__).with_name(name)
        if path.is_symlink() or sha(path.read_bytes())!=h:raise ValueError('HELPER_HASH_CHANGED')
    from universal_runtime_close import validate_runtime
    validate_runtime(plan)
    identity={k:v for k,v in plan.items() if k not in ['windowId','ownerAuthorized']}
    if plan['windowId']!=sha(canonical(identity)):raise ValueError('WINDOW_IDENTITY_CHANGED')
    return end

def same_row(alias,row):
    without_time={k:v for k,v in row.items() if k not in ['starts_at','expires_at']}
    return (f"to_jsonb({alias})-ARRAY['starts_at','expires_at']={quote(canonical(without_time).decode())}::jsonb "
            f"AND {alias}.starts_at={quote(row['starts_at'])}::timestamptz AND {alias}.expires_at={quote(row['expires_at'])}::timestamptz")

def close_sql(plan):
    validate(plan)
    lines=["BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714024,2);"]
    guards=[]
    for table,row in [('trip_source_universal_scope',plan['sourceScope']),('universal_import_provider_scope',plan['providerScope'])]:
        guards.append(f"IF EXISTS(SELECT 1 FROM public.{table} s WHERE NOT ({same_row('s',row)})) THEN RAISE EXCEPTION 'UNIVERSAL_WINDOW_DRIFT'; END IF;")
    for role in plan['temporaryRoles']:
        guards.append(f"IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname={quote(role['name'])} AND rolcanlogin AND rolvaliduntil IS DISTINCT FROM {quote(plan['expiresAt'])}::timestamptz) THEN RAISE EXCEPTION 'UNIVERSAL_ROLE_WINDOW_DRIFT'; END IF;")
    lines.append('DO $guard$ BEGIN '+' '.join(guards)+' END $guard$;')
    for role in plan['temporaryRoles']:
        lines.append(f"ALTER ROLE {role['name']} NOLOGIN;")
        lines.append(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename={quote(role['name'])} AND datname='postgres' AND pid<>pg_backend_pid() AND backend_start>={quote(plan['startsAt'])}::timestamptz AND backend_start<{quote(plan['expiresAt'])}::timestamptz;")
    for table,row in [('trip_source_universal_scope',plan['sourceScope']),('universal_import_provider_scope',plan['providerScope'])]:
        lines.append(f"DELETE FROM public.{table} s WHERE {same_row('s',row)};")
    lines.append('COMMIT;')
    return '\n'.join(lines)

def readback_sql(plan):
    validate(plan)
    parts=['NOT EXISTS(SELECT 1 FROM public.trip_source_universal_scope)','NOT EXISTS(SELECT 1 FROM public.universal_import_provider_scope)']
    for r in plan['temporaryRoles']:
        parts += [f"NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname={quote(r['name'])} AND rolcanlogin)",f"NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename={quote(r['name'])} AND backend_start>={quote(plan['startsAt'])}::timestamptz AND backend_start<{quote(plan['expiresAt'])}::timestamptz)"]
    return 'BEGIN READ ONLY; SELECT '+' AND '.join(parts)+' AS closed; COMMIT;'

def is_closed(value):
    rows=value if isinstance(value,list) else value.get('rows') if isinstance(value,dict) else None
    return rows==[{'closed':True}]

class SqlTransport:
    # Same trusted CLI mechanism as existing finite control, with no credentials in argv/logs.
    def __init__(self,cli,linked_worktree,private_dir):
        self.cli,self.cwd,self.directory=cli,linked_worktree,private_dir
    def __call__(self,text):
        fd,path=tempfile.mkstemp(prefix='universal-close-',suffix='.sql',dir=self.directory);os.fchmod(fd,0o600)
        try:
            with os.fdopen(fd,'w') as f:f.write(text)
            r=subprocess.run([self.cli,'db','query','--linked','--project-ref','tuqigdxrvrerfewsxqgm','--file',path,'--output','json'],cwd=self.cwd,capture_output=True,text=True,timeout=35)
            if r.returncode:raise RuntimeError('UNIVERSAL_MANAGEMENT_TRANSPORT_UNKNOWN')
            return json.loads(r.stdout)
        finally:os.unlink(path)

def close_once(plan,sql,runtime,recover_only=False):
    validate(plan)
    if plan['ownerAuthorized'] is not True:raise ValueError('OWNER_EXECUTION_REQUIRED')
    disposition='READ_ONLY' if recover_only else 'ACKNOWLEDGED'
    if not recover_only:
        try:sql(close_sql(plan))
        except Exception:disposition='UNKNOWN'
    # Independent readback is mandatory, even after an acknowledged COMMIT. Never repeat write.
    try:closed=is_closed(sql(readback_sql(plan)))
    except Exception:closed=False
    if not closed:return {'status':'RECONCILE_REQUIRED','windowId':plan['windowId'],'sqlWriteDisposition':disposition,'sqlClosed':False,'runtimeClosed':False}
    try:
        r=runtime(plan)
        restored=r=={'verified':True,'windowId':plan['windowId']}
    except Exception:restored=False
    return {'status':'CLOSED_VERIFIED' if restored else 'RECONCILE_REQUIRED','windowId':plan['windowId'],'sqlWriteDisposition':disposition,'sqlClosed':True,'runtimeClosed':restored}
