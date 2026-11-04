#!/usr/bin/env python3
"""One network-none, bounded PG capability test; never opens a Hosted connection."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[2]
D = ['/opt/homebrew/bin/docker', '--context', 'colima']
IMAGE = 'otr-core-v2-server84-fixture:20261012'
IMAGE_SHA = 'sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
A = '1f3d7935-1bdc-4952-8d7f-0f72077368c1'
T = '8b5ceb55-b3c2-462a-9a15-59de91fdabe5'
OLD_A = 'f4b059c5-8241-4ffb-aa15-37fa25474543'
OLD_T = '825f79b2-4a9d-4535-a62e-43000ca50c4a'
quote = lambda value: "'" + str(value).replace("'", "''") + "'"
sha = lambda value: hashlib.sha256(value).hexdigest()

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--preimage', required=True, type=Path)
    p.add_argument('--private-artifacts', required=True, type=Path)
    p.add_argument('--evidence', required=True, type=Path)
    args = p.parse_args()
    patcher = runpy.run_path(str(ROOT / 'scripts/trip/core-txt-p6-capability-patch.py'))
    before = args.preimage.read_bytes()
    after = patcher['patch'](before)
    assert after.replace(patcher['BRANCH'].read_bytes(), b'', 1) == before
    try:
        patcher['patch'](before + b'\n')
    except ValueError:
        pass
    else:
        raise AssertionError('PREIMAGE_DRIFT_ACCEPTED')
    args.private_artifacts.mkdir(parents=True, exist_ok=True, mode=0o700)
    name = 'otr-txt-p6-' + uuid.uuid4().hex[:12]
    checks = ['EXACT_PATCH_OLD_BRANCH_BYTES_UNCHANGED', 'PREIMAGE_DRIFT_FAIL_CLOSED']
    created = False
    phase = 'start'
    def sql(text, role='supabase_admin', fail=False):
        r = subprocess.run(D + ['exec', '-i', name, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', role,
          '-d', 'txt_p6_fixture', '-v', 'ON_ERROR_STOP=1'], input=text, text=True,
          capture_output=True, timeout=20)
        fd = os.open(args.private_artifacts / 'PG.private.log', os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as log:
            log.write('\n[' + phase + ']\n' + r.stdout + r.stderr)
        if r.returncode and not fail:
            raise RuntimeError('ISOLATED_PG_FAILED_' + phase)
        return r
    def metadata():
        return json.loads(sql("SELECT jsonb_build_object('oid',oid::text,'owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'security',prosecdef) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure").stdout)
    now = datetime.now(timezone.utc)
    s = {key: str(uuid.uuid4()) for key in ['sourceId','batchId','taskId','candidateId','targetId','operationId','slotId']}
    s.update(family='P6', tripId=T, token='i1', resultSha256='a'*64, title='Synthetic finite P6 capability fixture',
      localDate='2026-11-06', startsAt=(now-timedelta(seconds=30)).isoformat(), expiresAt=(now+timedelta(minutes=5)).isoformat())
    def evaluate(scope=s, actor=A, trip=T, family='P6', context=None, enabled=True, normal=True, role='otr_trip_core_v2_gateway', revoked=False):
        scope_json=json.dumps(scope,separators=(',',':'))
        sql('SET ROLE postgres;UPDATE public.fixture_core_gate SET allowed=' + str(normal).lower() + ';DELETE FROM public.trip_sustained_dev_policy;INSERT INTO public.trip_sustained_dev_policy VALUES(' + quote(actor) + '::uuid,true,' + ('clock_timestamp()' if revoked else 'NULL') + ',' + str(enabled).lower() + ',' + quote(scope_json) + '::jsonb);')
        c={'actor':actor,'trip':trip,'operation':'','command':'','family':'','admission':'','target_item':'','source_intent':''}
        c.update(context or {})
        settings=''.join('SELECT set_config('+quote('otr.core.'+key)+','+quote(value)+',true);' for key,value in c.items())
        result=sql('BEGIN;'+settings+'SELECT set_config(\'otr.universal.requested_family\','+quote(family)+',true);SELECT row_to_json(c) FROM public.trip_sustained_import_p1_capabilities('+quote(actor)+'::uuid,'+quote(trip)+'::uuid) c;ROLLBACK;',role)
        return json.loads(result.stdout.strip().splitlines()[-1])
    def deny(label, **options):
        assert evaluate(**options)['runtime_enabled'] is False, label
        checks.append(label)
    try:
        subprocess.run(D+['run','--detach','--pull=never','--network','none','--memory','256m','--cpus','1',
          '--label','otr.core.fixture=txt-p6-capability','--name',name,IMAGE],capture_output=True,check=True,timeout=30)
        created=True
        assert subprocess.check_output(D+['inspect','--format','{{.Image}}',name],text=True).strip()==IMAGE_SHA
        for _ in range(40):
            if subprocess.run(D+['exec',name,'pg_isready','-U','supabase_admin'],capture_output=True,timeout=5).returncode==0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError('ISOLATED_PG_NOT_READY')
        subprocess.run(D+['exec',name,'createdb','-h','127.0.0.1','-U','supabase_admin','-O','postgres','txt_p6_fixture'],capture_output=True,check=True,timeout=15)
        phase='synthetic-capability-dependencies'
        helper=(ROOT/'supabase/migrations/20261004000400_trip_event_command_foundation.sql').read_text()
        helper=helper[helper.index('create function public.trip_event_keys('):helper.index('create function public.trip_event_coordinate(')]
        sql('''CREATE ROLE otr_trip_core_v2_gateway LOGIN NOINHERIT NOBYPASSRLS CONNECTION LIMIT 1;
CREATE ROLE otr_trip_core_v2_writer NOLOGIN NOINHERIT NOBYPASSRLS;
SET ROLE postgres;
CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,revoked_at timestamptz,universal_p1_import_enabled boolean NOT NULL DEFAULT false,universal_p1_review_scope jsonb);
CREATE TABLE public.trip_source_core_v2_slots(account_id uuid,trip_id uuid,operation_id uuid,command text,canonical_intent_text text);
CREATE TABLE public.trip_core_airport_identities(airport_code text,registry_version text);
CREATE TABLE public.fixture_core_gate(allowed boolean);INSERT INTO public.fixture_core_gate VALUES(true);
CREATE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid,trip uuid,unused uuid,purpose text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT coalesce((SELECT allowed FROM public.fixture_core_gate),false) AND purpose='CORE' AND actor=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip=nullif(current_setting('otr.core.trip',true),'')::uuid $$;
CREATE FUNCTION public.trip_core_resolve_airport(text,text,text,date) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
'''+helper+before.decode()+''';REVOKE ALL ON FUNCTION public.trip_sustained_import_p1_capabilities(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_sustained_import_p1_capabilities(uuid,uuid) TO otr_trip_core_v2_gateway,otr_trip_core_v2_writer;''')
        phase='before-new-branch'
        deny('ORIGINAL_NEW_QA_P6_REJECTED')
        original=metadata()
        phase='candidate-definition-only'
        sql('SET ROLE postgres;'+after.decode()+';')
        assert metadata()==original
        checks.append('OID_OWNER_ACL_CONFIG_SECURITY_PRESERVED')
        deny('DEFAULT_FLAG_FALSE',enabled=False)
        phase='positive-capability-negotiation'
        cap=evaluate()
        assert cap=={'runtime_enabled':True,'enabled_commands':['CREATE_ITEM'],'enabled_families':['P6'],'enabled_admission_modes':['REVIEWED_SOURCE']}
        assert sql('SELECT count(*) FROM public.trip_source_core_v2_slots').stdout.strip()=='0'
        checks.append('PREFLIGHT_EXACT_SCOPE_WITH_NO_EXISTING_SLOT_AND_NO_WRITE_CONTEXT')
        assert evaluate(family='')==cap
        checks.append('GENERIC_NEGOTIATION_RETURNS_ONLY_FINITE_P6')
        write={'command':'CREATE_ITEM','family':'P6','admission':'REVIEWED_SOURCE','target_item':s['targetId'],'operation':s['operationId'],'source_intent':s['slotId']}
        assert evaluate(context=write)['runtime_enabled']
        checks.append('MATCHING_WRITE_CONTEXT_NEGOTIATION')
        phase='finite-scope-negatives'
        for key in s:
            changed=copy.deepcopy(s);del changed[key]
            deny('MISSING_SCOPE_'+key,scope=changed)
        for key in ['sourceId','targetId','operationId','slotId']:
            changed=copy.deepcopy(s);changed[key]='not-a-uuid'
            deny('MALFORMED_'+key,scope=changed)
        for family in ['P1','P2','P3','P4','P5']:
            deny('OTHER_FAMILY_'+family,family=family)
        deny('WRONG_ACTOR',actor=str(uuid.uuid4()))
        deny('WRONG_TRIP',trip=str(uuid.uuid4()))
        deny('CORE_SCOPE_REJECTED',normal=False)
        deny('POLICY_REVOKED',revoked=True)
        deny('MANUAL_REJECTED',context={'admission':'MANUAL'})
        for key in ['target_item','operation','source_intent']:
            deny('MISMATCHED_CONTEXT_'+key,context={key:str(uuid.uuid4())})
        deny('MISMATCHED_CONTEXT_FAMILY',context={'family':'P3'})
        deny('MISMATCHED_CONTEXT_COMMAND',context={'command':'SET_ITEM_TEXT'})
        deny('MISMATCHED_CONTEXT_ACTOR',context={'actor':str(uuid.uuid4())})
        deny('MISMATCHED_CONTEXT_TRIP',context={'trip':str(uuid.uuid4())})
        for label,updates in [('EXPIRED',{'startsAt':(now-timedelta(minutes=10)).isoformat(),'expiresAt':(now-timedelta(minutes=1)).isoformat()}),('NOT_STARTED',{'startsAt':(now+timedelta(minutes=1)).isoformat()}),('OVER15MIN',{'expiresAt':(now+timedelta(minutes=16)).isoformat()}),('INFINITY',{'expiresAt':'infinity'}),('MODE_CONTINUOUS',{'mode':'CONTINUOUS_MINIMUMS'}),('WRONG_SCOPE_FAMILY',{'family':'P3'}),('BAD_HASH',{'resultSha256':'z'*64}),('BAD_DATE',{'localDate':'not-a-date'}),('MISSING_REVIEW_TITLE',{'title':''})]:
            changed=copy.deepcopy(s);changed.update(updates)
            deny(label,scope=changed)
        phase='old-branches-unchanged'
        for family in ['P1','P3','P4','P5','P6']:
            old=copy.deepcopy(s);old.update(tripId=OLD_T,family=family)
            assert evaluate(scope=old,actor=OLD_A,trip=OLD_T,family=family)['runtime_enabled']
            checks.append('OLD_QA_FINITE_'+family+'_PRESERVED')
        checks.append('OLD_P2_BRANCH_BYTES_UNCHANGED_NOT_REOPENED')
        result={'status':'LOCAL_CAPABILITY_PG_PASS_NOT_ADMISSION_OR_INSTALL_READY','checks':checks,'count':len(checks),
          'preimageSHA256':sha(before),'candidateDefinitionSHA256':sha(after),'imageId':IMAGE_SHA,
          'resourceBoundary':'One unique disposable container; network none, no published ports, memory256m/cpu1; no Hosted connection or credentials',
          'fixtures':'New synthetic database; all proposed Source/Run/Task/slot IDs are test-only, no Source or formal item exists',
          'authorityStub':'trip_sustained_dev_scope_allowed is a scoped fixture boolean; canonical actual Owner/RLS/Source proof is NOT proved here',
          'notProved':['Actual mutation guard missing/mismatched native Review enforcement','Hosted metadata/composition/actual SQL installation','Formal Admission/Core Save/Receipt','Provider/Source/Native E2E'],
          'remaining':'Root2 current direct Review/slot/publication guard metadata, independent Review and exact protected default-closed installation/activation Gate'}
    except Exception as error:
        failure={'status':'LOCAL_CAPABILITY_PG_NOT_PASS','phase':phase,'failureClass':type(error).__name__,'checksCompleted':checks,'preimageSHA256':sha(before),'candidateDefinitionSHA256':sha(after),'noHosted':True}
        args.evidence.parent.mkdir(parents=True,exist_ok=True)
        args.evidence.write_text(json.dumps(failure,indent=2)+'\n')
        raise
    finally:
        if created:
            subprocess.run(D+['rm','--force',name],capture_output=True,check=True,timeout=15)
    result['containerRemoved']=True
    result['privateLogSHA256']=sha((args.private_artifacts/'PG.private.log').read_bytes())
    args.evidence.parent.mkdir(parents=True,exist_ok=True)
    args.evidence.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'status':result['status'],'count':len(checks),'containerRemoved':True}))

if __name__=='__main__':
    main()
