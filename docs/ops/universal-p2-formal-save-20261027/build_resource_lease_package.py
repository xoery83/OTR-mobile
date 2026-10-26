from pathlib import Path
import json,hashlib,shutil,datetime
p=Path('docs/ops/universal-p2-formal-save-20261027')
facts=json.loads((p/'P2_RESOURCE_AUTHORITY_PREIMAGE.json').read_text())['rows']
pre=next(r['proof']['definition'] for r in facts if r['kind']=='function' and r['proof']['name']=='flight_activation_reserve_call')
proposal=json.loads((p/'P2_BATCH9_BACKEND_IDENTITY_PROPOSAL.json').read_text())
old="(select count(*) from public.flight_call_resource_holds h join public.external_integration_calls c using(call_id) where h.account_id=r.account_id and (c.dispatch_state<>'TERMINAL' or c.execution_certainty='UNKNOWN'))"
exception="""sc.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid AND sc.revision=6
 AND sc.environment='DEV' AND sc.workload='UNIVERSAL_IMPORT_V1' AND sc.concurrent_account=1
 AND r.environment='DEV' AND r.task_class='UNIVERSAL_IMPORT_V1' AND r.provider_id='DeepSeek' AND r.model_id='deepseek-flash'
 AND r.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND r.user_id=r.account_id
 AND r.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
 AND r.integration_id='otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d'
 AND c.account_id=r.account_id AND c.trip_id=r.trip_id AND c.integration_id=r.integration_id
 AND c.environment='DEV' AND c.task_class='UNIVERSAL_IMPORT_V1' AND c.provider_id='DeepSeek' AND c.model_id='deepseek-flash'
 AND c.dispatch_state='MAY_HAVE_STARTED' AND c.execution_certainty IN('RUNNING','UNKNOWN')
 AND h.scope_id=sc.scope_id AND h.account_id=c.account_id AND h.provider_id=c.provider_id
 AND EXISTS(SELECT 1 FROM public.model_task_admissions expired WHERE expired.call_id=c.call_id AND expired.account_id=c.account_id
 AND expired.integration_id=c.integration_id AND expired.task_id=c.task_id AND expired.contract_version='otr-model-task-v1'
 AND expired.request_snapshot->>'task_id'=c.task_id::text
 AND expired.deadline=(expired.request_snapshot->'policy_snapshot'->>'deadline')::timestamptz
 AND expired.deadline+interval '60 seconds'<clock_timestamp())"""
new=old[:-1]+" AND NOT coalesce(("+exception+"),false))"
assert pre.count(old)==1
post=pre.replace(old,new)
(p/'P2_RESOURCE_LEASE_FUNCTION_PREIMAGE.sql').write_text(pre)
(p/'P2_RESOURCE_LEASE_FUNCTION_POSTIMAGE.sql').write_text(post)
(p/'P2_RESOURCE_LEASE_EXCEPTION_PREDICATE.sql').write_text(exception+'\n')
prehash=hashlib.md5(pre.encode()).hexdigest();posthash=hashlib.md5(post.encode()).hexdigest()
def package(body,expected,desired,close):
 return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,2);
CREATE TEMP TABLE p2_resource_edges ON COMMIT DROP AS SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole;
CREATE TEMP TABLE p2_resource_function ON COMMIT DROP AS SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure;
DO $check$ BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_MAINTENANCE_IDENTITY';END IF;
 IF md5(pg_get_functiondef('public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure))<>'{expected}' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_FUNCTION_DRIFT';END IF;
 IF has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CREATE_PREIMAGE';END IF;
 {close}
END $check$;
GRANT otr_external_integration_meter_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_external_integration_meter_writer;
SET LOCAL ROLE otr_external_integration_meter_writer;
{body};
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM otr_external_integration_meter_writer;
DO $restore$ DECLARE old record;BEGIN
 SELECT * INTO old FROM pg_temp.p2_resource_edges WHERE grantor='postgres'::regrole;
 IF found THEN EXECUTE format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',CASE WHEN old.admin_option THEN 'true' ELSE 'false' END,CASE WHEN old.inherit_option THEN 'true' ELSE 'false' END,CASE WHEN old.set_option THEN 'true' ELSE 'false' END);
 ELSE REVOKE otr_external_integration_meter_writer FROM postgres;END IF;
 IF EXISTS((SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole EXCEPT SELECT * FROM pg_temp.p2_resource_edges)
 UNION ALL(SELECT * FROM pg_temp.p2_resource_edges EXCEPT SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole)) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_MEMBERSHIP_DRIFT';END IF;
 IF has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CREATE_DRIFT';END IF;
 IF EXISTS((SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure EXCEPT SELECT * FROM pg_temp.p2_resource_function)
 UNION ALL(SELECT * FROM pg_temp.p2_resource_function EXCEPT SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure)) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_ACL_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure))<>'{desired}' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_POSTIMAGE_DRIFT';END IF;
END $restore$;
COMMIT;
"""
(p/'P2_RESOURCE_LEASE_DEV_INSTALL.sql').write_text(package(post,prehash,posthash,"IF EXISTS(SELECT 1 FROM public.flight_activation_scopes WHERE scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid AND revision>=6) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_SCOPE_PREIMAGE';END IF;"))
(p/'P2_RESOURCE_LEASE_DEV_ROLLBACK.sql').write_text(package(pre,posthash,prehash,"IF EXISTS(SELECT 1 FROM public.flight_activation_scopes s WHERE s.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid AND s.active AND s.revision=(SELECT max(revision) FROM public.flight_activation_scopes WHERE scope_id=s.scope_id) AND s.revision=6) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CLOSE_SCOPE_FIRST';END IF;"))
scope=next(r['proof'] for r in facts if r['kind']=='scope').copy();assert scope['revision']==5
scope.update(revision=6,account_daily=20,dev_daily=20,provider_daily=20,account_day_cost_nanos=1000000000,dev_day_cost_nanos=1000000000)
scope.pop('scope_sha256')
(p/'P2_RESOURCE_LEASE_SCOPE6_UNSIGNED.json').write_text(json.dumps(scope,indent=2)+'\n')
(p/'P2_RESOURCE_LEASE_PACKAGE_HASHES.json').write_text(json.dumps({'status':'PREPARED_NOT_INSTALLED','preimageMD5':prehash,'postimageMD5':posthash,'newBatch':proposal['batchId'],'expectedNewTask':proposal['expectedTaskId'],'owningBindingNotYetPersisted':True,'resourceSemantics':'scoped admission concurrency lease expiry; no remote-stop or free-cost claim','files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in p.glob('P2_RESOURCE_LEASE_*.sql')}},indent=2)+'\n')
print(json.dumps({'preimageMD5':prehash,'postimageMD5':posthash,'status':'PREPARED_NOT_INSTALLED'}))
