"""Pure one-shot SECURITY-only contingency preparation. No transports or execution."""
import copy
import uuid
from pathlib import Path
from universal_continuous_sql_ports import validate_sql_plan
from universal_continuous_transition import ACTOR, canonical, sha, instant
from universal_config_control import ADMIN, grant_instant, grant_preimage_sql, grant_identity_sql, revoke_sql, revoked_sql
from universal_scope_close import quote
from build_universal_admin_plan import command_hash

SECURITY='d596e9f4-643e-4395-9428-e0c6acea0648'
CONFIG='d54496c1-273e-4181-a00c-6c76c022965c'
GATE=Path(__file__).resolve().parents[2]/'docs/ops/universal-stage2-20261025/actual-execution/cleanup-20261026/STAGE_II_CONSOLIDATED_RESUME_GATE.md'


def _normal(p):
    validate_sql_plan(p)
    if p['recoveryPreimages']['scope']['revision']!=4 or p['providerControl']['scopeActiveRow']['revision']!=5:
        raise ValueError('EXACT_APPROVED_RESUME_REQUIRED')
    grants=p['adminControl']['temporaryGrants']
    expected={'SECURITY_ADMIN':(SECURITY,9),'CONFIG_ADMIN':(CONFIG,7)}
    if len(grants)!=2:raise ValueError('EXACT_NORMAL_GRANTS_REQUIRED')
    for g in grants:
        if g['permission'] not in expected or (g['admin_grant_id'],g['grant_revision'])!=expected[g['permission']] or g['created_by']!=ACTOR:
            raise ValueError('EXACT_NORMAL_GRANTS_REQUIRED')
    return {g['permission']:g for g in grants}


def validate(p):
    normal=p['normalResumePlan'];grants=_normal(normal)
    if (p['version']!=1 or p['mode']!='RESUME_SECURITY_CLEANUP_ONLY'
        or p['approvedResumeGateSHA256']!=sha(GATE.read_bytes()) or p['normalResumePlanSHA256']!=sha(canonical(normal))
        or p['actorId']!=ACTOR or p['project']!=normal['project'] or p['runtime']!=normal['runtime']):
        raise ValueError('EXACT_RESCUE_SCOPE_REQUIRED')
    s,e,c=instant(p['startsAt']),instant(p['adminControl']['expiresAt']),instant(p['closeAt'])
    old_start=instant(normal['startsAt']);old_end=instant(normal['adminControl']['expiresAt'])
    separate=p['separateWindow']
    if (type(separate) is not bool or not 0<e-s<=900 or not s<c<=min(s+660,e-240)
        or (separate and s<old_end) or (not separate and (s<old_start or e!=old_end))):
        raise ValueError('FINITE_CLEANUP_WINDOW_REQUIRED')
    prior=p['closedSecurityPreimage'];expected={**grants['SECURITY_ADMIN'],'grant_revision':10,'revoked_at':prior.get('revoked_at')}
    if ({k:v for k,v in prior.items() if k!='expires_at'}!={k:v for k,v in expected.items() if k!='expires_at'}
        or grant_instant(prior['expires_at'])!=grant_instant(expected['expires_at'])
        or prior['revoked_at'] is None or not grant_instant(prior['created_at'])<=grant_instant(prior['revoked_at'])<=s):
        raise ValueError('EXACT_CLOSED_SECURITY10_REQUIRED')
    a=p['adminControl']
    if (a['actorId']!=ACTOR or a['startsAt']!=p['startsAt']
        or a['role']!={'name':ADMIN,'priorCanLogin':False,'expiresAt':a['expiresAt']}
        or a['grantRenewalPreimages']!={'SECURITY_ADMIN':prior}
        or a['temporaryGrants']!=[{**prior,'grant_revision':11,'revoked_at':None,'expires_at':a['expiresAt']}]):
        raise ValueError('SECURITY_ONLY_11_TO_12_REQUIRED')
    control=p['providerControl'];original=normal['providerControl']
    if set(control)!={'activationCommands','closeCommands'} or control['activationCommands']!=[] or len(control['closeCommands'])!=4:
        raise ValueError('EXACT_CLOSE_ONLY_COMMANDS_REQUIRED')
    ids={x['command'][k] for x in original['activationCommands']+original['closeCommands'] for k in ('request_id','audit_id')}
    for x,old in zip(control['closeCommands'],original['closeCommands']):
        command=x['command'];context=x['context']
        if (set(x)!=set(old) or x['kind']!=old['kind'] or set(command)!=set(old['command'])
            or {k:v for k,v in command.items() if k not in ('request_id','audit_id','request_sha256')}!={k:v for k,v in old['command'].items() if k not in ('request_id','audit_id','request_sha256')}
            or set(context)!=set(old['context'])
            or {k:v for k,v in context.items() if k not in ('request_id','request_sha256','verified_at','expires_at')}!={k:v for k,v in old['context'].items() if k not in ('request_id','request_sha256','verified_at','expires_at')}
            or command['request_sha256']!=command_hash({k:v for k,v in command.items() if k!='request_sha256'})
            or context['request_id']!=command['request_id'] or context['request_sha256']!=command['request_sha256']
            or instant(context['expires_at'])!=e or instant(context['verified_at'])>s):
            raise ValueError('IMMUTABLE_CLOSE_PAYLOAD_REQUIRED')
        for k in ('request_id','audit_id'):
            value=command[k]
            if str(uuid.UUID(value))!=value or value in ids:raise ValueError('FRESH_COMMAND_IDENTITIES_REQUIRED')
            ids.add(value)
    if 'operatorPlanSHA256' in p and p['operatorPlanSHA256']!=sha(canonical({k:v for k,v in p.items() if k!='operatorPlanSHA256'})):
        raise ValueError('PROJECTION_SEAL_REQUIRED')
    return a


def build(normal_resume_plan,closed_security_preimage,verified_at,starts_at,expires_at,close_at,separate_window=False,identity=lambda:str(uuid.uuid4())):
    normal=copy.deepcopy(normal_resume_plan);prior=copy.deepcopy(closed_security_preimage)
    p={'version':1,'mode':'RESUME_SECURITY_CLEANUP_ONLY','approvedResumeGateSHA256':sha(GATE.read_bytes()),
       'normalResumePlan':normal,'normalResumePlanSHA256':sha(canonical(normal)),
       'actorId':ACTOR,'project':normal['project'],'runtime':copy.deepcopy(normal['runtime']),
       'startsAt':starts_at,'closeAt':close_at,'separateWindow':separate_window,'closedSecurityPreimage':prior,
       'adminControl':{'actorId':ACTOR,'startsAt':starts_at,'expiresAt':expires_at,
          'role':{'name':ADMIN,'priorCanLogin':False,'expiresAt':expires_at},
          'grantRenewalPreimages':{'SECURITY_ADMIN':prior},
          'temporaryGrants':[{**prior,'grant_revision':11,'revoked_at':None,'expires_at':expires_at}]},
       'providerControl':{'activationCommands':[],'closeCommands':copy.deepcopy(normal['providerControl']['closeCommands'])}}
    for x in p['providerControl']['closeCommands']:
        command=x['command'];command.update(request_id=identity(),audit_id=identity())
        command['request_sha256']=command_hash({k:v for k,v in command.items() if k!='request_sha256'})
        x['context'].update(request_id=command['request_id'],request_sha256=command['request_sha256'],verified_at=verified_at,expires_at=expires_at)
    validate(p);p['operatorPlanSHA256']=sha(canonical(p));return p


def setup_sql(p):
    a=validate(p);prior=p['closedSecurityPreimage'];config=_normal(p['normalResumePlan'])['CONFIG_ADMIN']
    actor=quote(ACTOR)+'::uuid';key=quote(SECURITY)+'::uuid'
    guard="IF current_user<>'postgres' OR clock_timestamp()<"+quote(p['startsAt'])+"::timestamptz OR clock_timestamp()>="+quote(p['closeAt'])+"::timestamptz THEN RAISE EXCEPTION 'RESCUE_WINDOW';END IF;"
    guard+="PERFORM 1 FROM public.external_integration_admin_grants WHERE admin_grant_id IN ("+key+","+quote(CONFIG)+"::uuid) FOR UPDATE; IF NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+key+" AND "+grant_preimage_sql(prior)+") OR NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+quote(CONFIG)+"::uuid AND "+grant_identity_sql(config)+" AND grant_revision=8 AND revoked_at IS NOT NULL) OR (SELECT count(*) FROM public.external_integration_admin_grants WHERE actor_id="+actor+" AND environment='DEV')<>2 OR EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE actor_id="+actor+" AND environment='DEV' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'RESCUE_GRANT_PREIMAGE';END IF;"
    guard+="IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id="+actor+" AND NOT enabled AND NOT universal_import_enabled AND revoked_at IS NOT NULL) OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway','"+ADMIN+"') AND NOT rolcanlogin AND rolconnlimit=1 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)<>3 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway','"+ADMIN+"')) THEN RAISE EXCEPTION 'RESCUE_CLOSED_ROLE_POLICY_REQUIRED';END IF;"
    return "BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SELECT pg_advisory_xact_lock(714026,1);DO $rescue$ BEGIN "+guard+"END $rescue$;UPDATE public.external_integration_admin_grants g SET grant_revision=11,revoked_at=NULL,expires_at="+quote(a['expiresAt'])+"::timestamptz WHERE admin_grant_id="+key+" AND "+grant_preimage_sql(prior)+";ALTER ROLE "+ADMIN+" LOGIN CONNECTION LIMIT 1 VALID UNTIL "+quote(a['expiresAt'])+";COMMIT;"


def close_sql(p):return revoke_sql(validate(p))
def closed_sql(p):return revoked_sql(validate(p))


def _same_grant(actual, expected, revoked):
    times={'created_at','expires_at'}
    if (set(actual)!=set(expected) or {k:v for k,v in actual.items() if k not in times|{'revoked_at'}}!={k:v for k,v in expected.items() if k not in times|{'revoked_at'}}
        or any(grant_instant(actual[k])!=grant_instant(expected[k]) for k in times)):
        return False
    return actual['revoked_at'] is not None if revoked else actual['revoked_at'] is None


def active_security(plan,state):
    """Independent setup readback; state must come from actual owning role/grant SQL."""
    a=validate(plan);normal_grants=_normal(plan['normalResumePlan'])
    policy=state['policy']
    if (policy['actor_account_id']!=ACTOR or policy['enabled'] is not False or policy['universal_import_enabled'] is not False or policy['revoked_at'] is None
        or type(state['sessions']) is not int or state['sessions']!=0 or len(state['grants'])!=2):return False
    expected={SECURITY:a['temporaryGrants'][0],CONFIG:{**normal_grants['CONFIG_ADMIN'],'grant_revision':8}}
    if {g['admin_grant_id'] for g in state['grants']}!=set(expected):return False
    for g in state['grants']:
        if not _same_grant(g,expected[g['admin_grant_id']],g['admin_grant_id']==CONFIG):return False
    roles=state['roles'];names={ADMIN,'otr_trip_source_command_gateway','otr_external_integration_call_gateway'}
    if len(roles)!=3 or {r['name'] for r in roles}!=names:return False
    for role in roles:
        if role['unsafe'] is not False or type(role['limit']) is not int or role['limit']!=1 or role['login'] is not (role['name']==ADMIN):return False
        if role['name']==ADMIN and grant_instant(role['validUntil'])!=instant(a['expiresAt']):return False
    return True
