"""Approved run7 cleanup only. Reuse owning CP14/15 commands and exact retained restore.
No activation/price/source/task/business path; transports are explicit at execution.
"""
import copy
import json
import os
import time
import uuid
from pathlib import Path
from universal_scope_close import quote
from universal_continuous_transition import ACTOR, canonical, sha, instant, private, write_private
from universal_config_control import receipted, grant_preimage_sql, revoke_sql, grant_instant
from build_universal_admin_plan import command_hash

BASELINE_SHA = '6c19c22e01ece63d255002eaca1a75e84e9ed3e69c8d1a3ee2a57c4554e45b75'
GATE_PATH = Path(__file__).resolve().parents[2] / 'docs/ops/universal-stage2-20261025/actual-execution/continuous-recovery/CLEANUP_ONLY_OWNER_GATE.md'
SECURITY = 'd596e9f4-643e-4395-9428-e0c6acea0648'
CONFIG = 'd54496c1-273e-4181-a00c-6c76c022965c'
ADMIN = 'otr_external_integration_admin_gateway'


def validate(plan, execution=False):
    if execution and 'operatorPlanSHA256' not in plan:
        raise ValueError('SEALED_OPERATOR_PROJECTION_REQUIRED')
    if 'operatorPlanSHA256' in plan and plan['operatorPlanSHA256'] != sha(canonical({k:v for k,v in plan.items() if k!='operatorPlanSHA256'})):
        raise ValueError('SEALED_OPERATOR_PROJECTION_REQUIRED')
    b = plan['baseline']
    if (sha(canonical(b)) != BASELINE_SHA or plan['ownerGateSHA256'] != sha(GATE_PATH.read_bytes())
            or plan['mode'] != 'RUN7_CLEANUP_ONLY' or plan['version'] != 1
            or plan['actorId'] != ACTOR or plan['project'] != b['project'] or plan['runtime'] != b['runtime']):
        raise ValueError('EXACT_CLEANUP_SCOPE_REQUIRED')
    start, end = instant(plan['startsAt']), instant(plan['adminControl']['expiresAt'])
    if end-start != 900 or not 0 < instant(plan['closeAt'])-start <= 660:
        raise ValueError('EXACT_DUAL_DEADLINE_REQUIRED')
    a = plan['adminControl']
    prior = plan['securityPreimage']
    if (a['startsAt'] != plan['startsAt'] or a['actorId'] != ACTOR
            or prior['admin_grant_id'] != SECURITY or prior['actor_id'] != ACTOR
            or prior['permission'] != 'SECURITY_ADMIN' or prior['grant_revision'] != 6
            or prior['environment'] != 'DEV' or prior['created_by'] != ACTOR or prior['revoked_at'] is None
            or a['grantRenewalPreimages'] != {'SECURITY_ADMIN': prior}
            or a['temporaryGrants'] != [{**prior, 'grant_revision': 7, 'revoked_at': None, 'expires_at': a['expiresAt']}]
            or a['role'] != {'name': ADMIN, 'priorCanLogin': False, 'expiresAt': a['expiresAt']}):
        raise ValueError('SINGLE_EXISTING_SECURITY_GRANT_REQUIRED')
    if plan['providerControl']['activationCommands'] != []:
        raise ValueError('CLEANUP_NEVER_ACTIVATES')
    commands = plan['providerControl']['closeCommands']
    if len(commands) != 4: raise ValueError('EXACT_FOUR_CLOSE_COMMANDS_REQUIRED')
    ids = {x['command'][k] for x in b['providerControl']['activationCommands']+b['providerControl']['closeCommands'] for k in ['request_id','audit_id']}
    variable = {'request_id', 'request_sha256', 'audit_id'}
    context_variable = {'request_id', 'request_sha256', 'verified_at', 'expires_at'}
    for new, old in zip(commands, b['providerControl']['closeCommands']):
        if (set(new) != set(old) or new['kind'] != old['kind']
                or set(new['command']) != set(old['command'])
                or {k:v for k,v in new['command'].items() if k not in variable} != {k:v for k,v in old['command'].items() if k not in variable}
                or set(new['context']) != set(old['context'])
                or {k:v for k,v in new['context'].items() if k not in context_variable} != {k:v for k,v in old['context'].items() if k not in context_variable}
                or new['command']['request_sha256'] != command_hash({k:v for k,v in new['command'].items() if k!='request_sha256'})
                or new['context']['request_id'] != new['command']['request_id']
                or new['context']['request_sha256'] != new['command']['request_sha256']
                or instant(new['context']['expires_at']) != end or instant(new['context']['verified_at']) > start):
            raise ValueError('EXACT_CLOSE_PAYLOAD_AND_AUTH_REQUIRED')
        for key in ['request_id', 'audit_id']:
            value = new['command'][key]
            if str(uuid.UUID(value)) != value or value in ids: raise ValueError('FRESH_COMMAND_ID_REQUIRED')
            ids.add(value)
    return end


def build(baseline, security_preimage, verified_at, starts_at, expires_at, close_at):
    b = copy.deepcopy(baseline)
    p = {'version':1, 'mode':'RUN7_CLEANUP_ONLY', 'ownerGateSHA256':sha(GATE_PATH.read_bytes()),
         'baseline':b, 'actorId':ACTOR, 'project':b['project'], 'runtime':b['runtime'],
         'startsAt':starts_at, 'closeAt':close_at, 'securityPreimage':security_preimage,
         'providerControl':{'activationCommands':[], 'closeCommands':[]},
         'adminControl':{'startsAt':starts_at, 'expiresAt':expires_at, 'actorId':ACTOR,
            'role':{'name':ADMIN,'priorCanLogin':False,'expiresAt':expires_at},
            'grantRenewalPreimages':{'SECURITY_ADMIN':security_preimage},
            'temporaryGrants':[{**security_preimage,'grant_revision':7,'revoked_at':None,'expires_at':expires_at}]}}
    for original in b['providerControl']['closeCommands']:
        value=copy.deepcopy(original); c=value['command']; c['request_id']=str(uuid.uuid4());c['audit_id']=str(uuid.uuid4());c.pop('request_sha256');c['request_sha256']=command_hash(c)
        value['context'].update(request_id=c['request_id'],request_sha256=c['request_sha256'],verified_at=verified_at,expires_at=expires_at)
        p['providerControl']['closeCommands'].append(value)
    validate(p)
    return p


def observation_sql(plan):
    validate(plan)
    from universal_continuous_sql_ports import observe_sql
    b=plan['baseline']; q=observe_sql(b)
    old=','.join(quote(x['command']['request_id'])+'::uuid' for x in b['providerControl']['activationCommands']+b['providerControl']['closeCommands'])
    extra=','.join(quote(x['command']['request_id'])+'::uuid' for x in plan['providerControl']['closeCommands'])
    token='command_id IN ('+old+')'
    if q.count(token)!=1:raise ValueError('SEALED_OBSERVATION_QUERY_REQUIRED')
    return q.replace(token,'command_id IN ('+old+','+extra+')')


def roles_sql():
    actor=quote(ACTOR)+'::uuid'
    return "BEGIN READ ONLY; SELECT jsonb_build_object('policy',(SELECT to_jsonb(p) FROM public.trip_sustained_dev_policy p WHERE actor_account_id="+actor+"),'grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY permission) FROM public.external_integration_admin_grants g WHERE actor_id="+actor+" AND environment='DEV'),'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'limit',rolconnlimit,'validUntil',rolvaliduntil,'unsafe',rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) FROM pg_roles WHERE rolname IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway','otr_external_integration_admin_gateway')),'sessions',(SELECT count(*) FROM pg_stat_activity WHERE usename IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway','otr_external_integration_admin_gateway'))) AS state;COMMIT;"


def closed_roles(state, after=False):
    grants=state['grants']; expected=8 if after else 6
    return (state['policy']['enabled'] is False and state['policy']['universal_import_enabled'] is False
        and len(grants)==2 and {g['admin_grant_id'] for g in grants}=={CONFIG,SECURITY}
        and all(g['revoked_at'] is not None and g['actor_id']==ACTOR and g['environment']=='DEV'
                and g['grant_revision']==(expected if g['admin_grant_id']==SECURITY else 6) for g in grants)
        and len(state['roles'])==3 and all(r['login'] is False and r['limit']==1 and r['unsafe'] is False for r in state['roles'])
        and type(state['sessions']) is int and state['sessions']==0)


def active_security(state, plan):
    if state['policy']['enabled'] is not False or state['policy']['universal_import_enabled'] is not False or type(state['sessions']) is not int or state['sessions'] != 0:return False
    grants=state['grants'];a=plan['adminControl'];expected=a['temporaryGrants'][0]
    if len(grants)!=2:return False
    for g in grants:
        if g['admin_grant_id']==SECURITY:
            if ({k:v for k,v in g.items() if k!='expires_at'}!={k:v for k,v in expected.items() if k!='expires_at'}
                or grant_instant(g['expires_at'])!=instant(a['expiresAt'])):return False
        elif g['admin_grant_id']!=CONFIG or g['permission']!='CONFIG_ADMIN' or g['grant_revision']!=6 or g['revoked_at'] is None:return False
    if len(state['roles'])!=3:return False
    for r in state['roles']:
        if r['unsafe'] is not False or r['limit']!=1 or r['login'] is not (r['name']==ADMIN):return False
        if r['name']==ADMIN and grant_instant(r['validUntil'])!=instant(a['expiresAt']):return False
    return True


def setup_sql(plan):
    validate(plan);a=plan['adminControl'];prior=plan['securityPreimage']; actor=quote(ACTOR)+'::uuid';sid=quote(SECURITY)+'::uuid'
    return "BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SELECT pg_advisory_xact_lock(714026,1);DO $cleanup$ BEGIN " + \
      "IF current_user<>'postgres' OR clock_timestamp()<"+quote(plan['startsAt'])+"::timestamptz OR clock_timestamp()>="+quote(plan['closeAt'])+"::timestamptz THEN RAISE EXCEPTION 'CLEANUP_WINDOW';END IF;" + \
      "PERFORM 1 FROM public.external_integration_admin_grants WHERE admin_grant_id="+sid+" FOR UPDATE; IF NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+sid+" AND "+grant_preimage_sql(prior)+") OR EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE actor_id="+actor+" AND environment='DEV' AND revoked_at IS NULL) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+ADMIN+"' AND NOT rolcanlogin AND rolconnlimit=1 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls) OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway','otr_external_integration_admin_gateway')) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway') AND rolcanlogin) OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id="+actor+" AND NOT enabled AND NOT universal_import_enabled AND revoked_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE admin_grant_id='"+CONFIG+"'::uuid AND actor_id="+actor+" AND environment='DEV' AND permission='CONFIG_ADMIN' AND grant_revision=6 AND revoked_at IS NOT NULL) OR (SELECT count(*) FROM public.external_integration_admin_grants WHERE actor_id="+actor+" AND environment='DEV')<>2 THEN RAISE EXCEPTION 'CLEANUP_EXACT_SECURITY_PREIMAGE';END IF;END $cleanup$;" + \
      "UPDATE public.external_integration_admin_grants g SET expires_at="+quote(a['expiresAt'])+"::timestamptz,revoked_at=NULL,grant_revision=7 WHERE admin_grant_id="+sid+" AND "+grant_preimage_sql(prior)+"; ALTER ROLE "+ADMIN+" LOGIN CONNECTION LIMIT 1 VALID UNTIL "+quote(a['expiresAt'])+";COMMIT;"


def provider_closed(o):
    return (o['scopeState']=='CLOSED' and o['grantState']=='CLOSED'
        and o['integration']=={'config_version':15,'kill_switch':True}
        and o['environment']=={'config_version':15,'kill_switch':True,'runtime_enabled':False})


def assert_phase(o,index,after):
    # Bound individual owning row before a send, then require its receipted successor.
    if index<2:
        key='grantState' if index==0 else 'scopeState';expected='CLOSED' if after else 'ACTIVE'
        if o[key]!=expected:raise ValueError('CLEANUP_CP15_ROW_DRIFT')
    else:
        key='integration' if index==2 else 'environment'; row=o[key]
        if row['config_version']!=(15 if after else 14) or row['kill_switch'] is not after:
            raise ValueError('CLEANUP_KILL_ROW_DRIFT')
        if index==3 and row['runtime_enabled'] is not False:raise ValueError('GLOBAL_RUNTIME_MUST_STAY_CLOSED')


def close_once(plan, run_dir, ports, clock=time.time):
    """Caller holds an exclusive process lock. Every send has an immutable remote claim."""
    end=validate(plan);run=private(run_dir,True);outcomes=[]
    try:
        for i,command in enumerate(plan['providerControl']['closeCommands']):
            o=ports['observe']()
            if receipted(o,command):assert_phase(o,i,True);continue
            if ports['claimed'](command):raise ValueError('CLAIM_WITHOUT_RECEIPT_RECONCILE_REQUIRED')
            if not instant(plan['startsAt'])<=clock()<end-180:raise ValueError('CLEANUP_RESTORE_RESERVE_REQUIRED')
            assert_phase(o,i,False)
            disposition='ACKNOWLEDGED'
            try:ports['invoke'](i)
            except Exception:disposition='UNKNOWN'
            o=ports['observe']()
            if not receipted(o,command):raise ValueError('CLEANUP_COMMAND_UNCONFIRMED')
            assert_phase(o,i,True);outcomes.append({'index':i,'disposition':disposition,'verified':True})
        if not provider_closed(ports['observe']()):raise ValueError('CLEANUP_PROVIDER_NOT_CLOSED')
    except Exception:
        # Even when a Provider outcome remains uncertain, temporary Admin must close.
        try:ports['revoke_admin']()
        except Exception:pass
        try:admin_closed=ports['roles_closed']()
        except Exception:admin_closed=False
        result={'status':'RECONCILE_REQUIRED','steps':outcomes,'adminClosed':admin_closed}
        write_private(run/'cleanup-result.json',result);return result
    admin_disposition='ACKNOWLEDGED'
    try:ports['revoke_admin']()
    except Exception:admin_disposition='UNKNOWN'
    try:admin_closed=ports['roles_closed']()
    except Exception:admin_closed=False
    if not admin_closed:
        result={'status':'RECONCILE_REQUIRED','steps':outcomes,'adminClosed':False,'adminDisposition':admin_disposition}
    else:
        disposition='READBACK_ONLY'
        claim=run/'restore-claimed.json'
        if not claim.exists():
            write_private(claim,{'planSHA256':sha(canonical(plan))})
            disposition='ACKNOWLEDGED'
            try:ports['restore']()
            except Exception:disposition='UNKNOWN'
        # A restore timeout is reconciled through exact runtime readback, never resent.
        try:verified=ports['verify_restored']() and provider_closed(ports['observe']()) and ports['roles_closed']()
        except Exception:verified=False
        result={'status':'CLOSED_VERIFIED' if verified else 'RECONCILE_REQUIRED','steps':outcomes,'adminClosed':True,'adminDisposition':admin_disposition,'restoreDisposition':disposition,'rollbackVerified':verified}
    write_private(run/'cleanup-result.json',result);return result
