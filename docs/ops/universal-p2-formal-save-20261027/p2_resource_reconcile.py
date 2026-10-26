"""Read-only recovery of committed scope6; configuration uses its CP14 config audit.
No provisioning, SQL installation, CP14 dispatch or credential access.
"""
import argparse,importlib.util,json,pathlib,time
PACKET=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('sealed_p2_window',PACKET/'p2_resource_window.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def config_audit_matches(row,p):
 c=p['providerControl']['activationCommands'][0]['command'];ctx=p['providerControl']['activationCommands'][0]['context']
 scope=m.sha(m.canonical({k:v for k,v in ctx.items() if k not in ['verified_at','expires_at','revoked','request_id','request_sha256','command_kind']}))
 exact={'audit_id':c['audit_id'],'command_id':c['request_id'],'admin_actor_id':m.ACTOR,'integration_id':m.INTEGRATION,'environment':'DEV','entity_kind':'flight_scope','entity_key':m.INTEGRATION,'previous_version':5,'new_version':6,'after_sha256':p['scope6']['scope_sha256'],'before_sha256':None,'change_type':'CONFIG','reason_code':c['reason_code'],'safe_diff':{'command_kind':'flight_activation_select','request_sha256':c['request_sha256'],'scope_sha256':scope}}
 return all(row.get(k)==v for k,v in exact.items()) and m.epoch(p['startsAt'])<=m.epoch(row['occurred_at'])<m.epoch(p['expiresAt'])
def reconcile(root):
 root,p=m.load(root);transport=m.sql(root)
 with m.control_lock(root):
  first=m.observe(transport)
  if not m.terminal_success(first,p):raise ValueError('TERMINAL_SUCCESS_NOT_PROVEN')
  c=p['providerControl']['activationCommands'][0]['command']
  result=transport("BEGIN READ ONLY;SELECT to_jsonb(a) AS audit FROM public.external_integration_config_audit a WHERE command_id="+m.quote(c['request_id'])+"::uuid;COMMIT;")['rows']
  if len(result)!=1 or not config_audit_matches(result[0]['audit'],p):raise ValueError('EXACT_CONFIG_AUDIT_NOT_PROVEN')
  if transport(m.revoked_sql(p['adminControl']))['rows']!=[{'closed':True}]:raise ValueError('ADMIN_CLOSURE_NOT_PROVEN')
  second=m.observe(transport)
  if second!=first or not m.terminal_success(second,p):raise ValueError('SECOND_READBACK_CHANGED')
  output={'status':'SCOPE6_VERIFIED_FUNCTION_INSTALLED_ADMIN_CLOSED','at':m.iso(time.time()),'planSHA256':m.sha(m.canonical(p)),'recoveredCommittedSuccess':True,'reader':'p2_resource_reconcile.py','readerSHA256':m.sha(pathlib.Path(__file__).read_bytes()),'originalVerifierDefect':'unsupported extra request-binding row; existing CP14 config-replay uses one config audit','configAudit':result[0]['audit'],'observed':second,'protectedWritesDuringReconciliation':0,'providerCalls':0}
  if (root/'success-recovered.json').exists():
   prior=json.loads(m.private(root/'success-recovered.json').read_text())
   if prior['planSHA256']!=output['planSHA256'] or prior.get('configAudit')!=output['configAudit']:raise ValueError('RECONCILIATION_MARKER_DRIFT')
   return prior
  m.write(root/'success-recovered.json',output);return output
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--run-dir',required=True);x=a.parse_args()
 try:print(json.dumps(reconcile(x.run_dir)))
 except Exception as e:print(json.dumps({'status':'READONLY_RECONCILIATION_UNCONFIRMED','errorClass':type(e).__name__}));raise SystemExit(2)
