#!/usr/bin/env python3
"""Root-only no-network CP14 command binder. It consumes authority; it never issues it."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
from universal_scope_close import canonical,instant,uid,digest,validate,sha
from universal_config_control import CONTEXT,ADMIN,validate_admin

ORDER=('configure','providerConfig','price','openIntegration','openEnvironment','restoreEnvironment','restoreIntegration')
ROW_KEYS={
 'integration':set('integration_id category vendor_namespace environment admin_label enabled kill_switch config_version config_sha256 credential_reference auth_config_reference capabilities quota_limit quota_window_seconds rate_per_minute health_state health_observed_at health_observation_id created_at updated_at created_by updated_by'.split()),
 'provider':set('provider_config_id integration_id provider_id model_id model_version adapter_version config_version configuration_sha256 provider_class capabilities modalities schema_contracts schema_output privacy_policy network_required data_region routing_class routing_priority routing_eligibility input_byte_limit output_byte_limit input_count_limit max_complexity max_risk replay_support quality_policy_reference quality_policy_sha256 quality_observation_reference latency_estimate_ms expected_completion_cost_nanos expected_cost_currency created_at created_by'.split()),
 'price':set('price_schedule_id integration_id provider_id model_id schedule_version currency effective_from effective_until source_reference source_version schedule_sha256 supersedes_schedule_id rounding_policy created_at created_by'.split()),
}
AUTH_BASE=CONTEXT-{'request_id','request_sha256','command_kind','gateway_identity'}
FACT_KEYS={'version','actorId','outerStartsAt','outerExpiresAt','environmentBaseline','connection','verifiedAuthorityReceiptSHA256','normalAuthReceiptSHA256','authSessionExpiresAt','authContextBase','commandIdentities','grantIdentities','grantorActorId','reasonCode','integrationRow','providerRow','priceRow','priceUnits'}

def command_hash(value):
 return sha(json.dumps({'domain':'otr-cp14-command-v1','command':value},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())

def build_admin_plan(raw_plan,facts):
 existing='integrationBaseline' in facts
 if set(facts)-{'grantRenewalPreimages','integrationBaseline','priceBaselineVersion'}!=FACT_KEYS or existing!=('priceBaselineVersion' in facts) or facts['version']!=1:raise ValueError('EXACT_ADMIN_BINDING_FACTS_REQUIRED')
 p=copy.deepcopy(raw_plan)
 if p.get('adminControl') is not None:raise ValueError('ADMIN_CONTROL_ALREADY_BOUND')
 actor=facts['actorId'];uid(actor);uid(facts['grantorActorId'])
 if p['project']!='tuqigdxrvrerfewsxqgm' or actor!=p['sourceScope']['actor_id'] or actor!=p['providerScope']['actor_id']:raise ValueError('EXACT_ACTOR_SCOPE_REQUIRED')
 for key in ['verifiedAuthorityReceiptSHA256','normalAuthReceiptSHA256']:
  digest(facts[key])
  if facts[key]=='0'*64:raise ValueError('ACTUAL_AUTHORITY_RECEIPTS_REQUIRED')
 auth=facts['authContextBase']
 if set(auth)!=AUTH_BASE or auth['version']!=1 or auth['principal_kind']!='OTR_ADMIN' or auth['verified_actor_id']!=actor or auth['verified_account_id']!=actor or auth['verified_environment']!='DEV' or auth['revoked'] is not False:raise ValueError('TRUSTED_ADMIN_ISSUER_BASE_REQUIRED')
 if not re.fullmatch('[A-Za-z0-9._:-]{1,128}',auth['auth_source']) or type(auth['auth_config_version']) is not int or auth['auth_config_version']<1 or not isinstance(auth['auth_session_reference'],str) or not re.fullmatch('vault:[A-Za-z0-9/_-]{1,128}',auth['auth_session_reference']):raise ValueError('ACTUAL_AUTH_SESSION_BINDING_REQUIRED')
 if instant(auth['expires_at'])!=instant(facts['outerExpiresAt']) or instant(facts['authSessionExpiresAt'])<instant(auth['expires_at']) or instant(auth['verified_at'])>instant(facts['outerStartsAt']):raise ValueError('AUTH_SESSION_WINDOW_MISMATCH')
 if auth['verified_client_identity'] is not None:uid(auth['verified_client_identity'])
 subject=auth['verified_external_subject']
 if subject is not None:
  if set(subject)!={'issuer_namespace','subject_digest'} or not re.fullmatch('[A-Za-z0-9._:-]{1,128}',subject['issuer_namespace']):raise ValueError('ACTUAL_AUTH_SUBJECT_REQUIRED')
  digest(subject['subject_digest'])
 if set(facts['commandIdentities'])!=set(ORDER[2:] if existing else ORDER) or set(facts['grantIdentities'])!={'CONFIG_ADMIN','SECURITY_ADMIN'}:raise ValueError('EXPLICIT_SEVEN_COMMAND_TWO_GRANT_IDS_REQUIRED')
 seen=set()
 for identity in facts['commandIdentities'].values():
  if set(identity)!={'requestId','auditId'}:raise ValueError('EXACT_REQUEST_AUDIT_IDS_REQUIRED')
  for value in identity.values():
   uid(value)
   if value in seen:raise ValueError('ADMIN_IDENTITY_REUSED')
   seen.add(value)
 for value in facts['grantIdentities'].values():
  uid(value)
  if value in seen:raise ValueError('ADMIN_IDENTITY_REUSED')
  seen.add(value)
 if not re.fullmatch('[A-Za-z0-9._:-]{1,128}',facts['reasonCode']):raise ValueError('SAFE_REASON_CODE_REQUIRED')
 rows={key:copy.deepcopy(facts[name]) for key,name in [('integration','integrationRow'),('provider','providerRow'),('price','priceRow')]}
 integration=p['providerScope']['integration_id']
 for key,r in rows.items():
  if set(r)!=ROW_KEYS[key] or r['integration_id']!=integration or r['created_by']!=actor:raise ValueError('EXACT_CP14_OWNING_ROW_REQUIRED')
  for field in ['created_at']:instant(r[field])
 i,c,price=rows['integration'],rows['provider'],rows['price']
 if i['environment']!='DEV' or i['category']!='INTELLIGENCE_OUTBOUND' or i['config_version']!=1 or i['enabled'] is not True or i['kill_switch'] is not True or i['updated_by']!=actor or i['created_at']!=i['updated_at']:raise ValueError('NEW_CLOSED_INTEGRATION_ROW_REQUIRED')
 if not isinstance(i['credential_reference'],str) or not re.fullmatch(r'(?:vault:[A-Za-z0-9/_-]{1,128}|env:[A-Za-z0-9_]{1,128}|OTR_DEV_DEEPSEEK_API_KEY)',i['credential_reference']):raise ValueError('BACKEND_CREDENTIAL_REFERENCE_ONLY')
 if i['auth_config_reference'] is not None and not re.fullmatch(r'[A-Za-z0-9._:/-]{1,160}',i['auth_config_reference']):raise ValueError('AUTH_CONFIGURATION_REFERENCE_ONLY')
 digest(i['config_sha256']);digest(c['configuration_sha256']);digest(price['schedule_sha256'])
 if c['provider_config_id']!=p['providerScope']['provider_config_id'] or c['config_version']!=1 or c['provider_id']!='DeepSeek' or c['model_id']!='deepseek-flash' or c['model_version']!='DeepSeek-V4.1-Flash' or c['provider_class']!='COMMERCIAL_REMOTE' or c['network_required'] is not True or c['routing_eligibility']!='ELIGIBLE':raise ValueError('QUALIFIED_UNIVERSAL_PROVIDER_ROW_REQUIRED')
 if price['price_schedule_id']!=p['providerScope']['price_schedule_id'] or price['provider_id']!=c['provider_id'] or price['model_id']!=c['model_id'] or price['currency']!='USD' or price['supersedes_schedule_id'] is not None or price['rounding_policy']!='SUM_THEN_CEIL_NANOS_V1':raise ValueError('EXACT_NEW_PRICE_SCHEDULE_REQUIRED')
 instant(price['effective_from'])
 if price['effective_until'] is not None and instant(price['effective_until'])<=instant(price['effective_from']):raise ValueError('PRICE_WINDOW_INVALID')
 units=copy.deepcopy(facts['priceUnits']);kinds={'input_tokens','cached_input_tokens','output_tokens'}
 if not isinstance(units,list) or len(units)!=3 or {u['measurement_unit'] for u in units}!=kinds:raise ValueError('EXACT_THREE_DISJOINT_PRICE_UNITS_REQUIRED')
 for u in units:
  if set(u)!={'price_schedule_id','unit_key','measurement_unit','unit_quantity','price_per_quantity','unit_definition'} or u['price_schedule_id']!=price['price_schedule_id'] or u['unit_key']!=u['measurement_unit'] or type(u['unit_quantity']) is not int or u['unit_quantity']<1 or not isinstance(u['price_per_quantity'],str) or not re.fullmatch(r'[0-9]{1,42}(\.[0-9]{1,18})?',u['price_per_quantity']) or u['unit_definition']!={'version':1,'relationship':'DISJOINT','included_in':None,'billable':True}:raise ValueError('EXACT_APPROVED_PRICE_UNIT_REQUIRED')
 baseline=facts['environmentBaseline']
 if set(baseline)!={'config_version','kill_switch'} or type(baseline['config_version']) is not int or baseline['config_version']<1 or baseline['kill_switch'] is not True:raise ValueError('ACTUAL_CLOSED_ENVIRONMENT_BASELINE_REQUIRED')
 a={'version':1,'actorId':actor,'integrationId':integration,'startsAt':facts['outerStartsAt'],'expiresAt':facts['outerExpiresAt'],'connection':copy.deepcopy(facts['connection']),'verifiedAuthorityReceiptSHA256':facts['verifiedAuthorityReceiptSHA256'],'normalAuthReceiptSHA256':facts['normalAuthReceiptSHA256'],'role':{'name':ADMIN,'priorCanLogin':False,'expiresAt':facts['outerExpiresAt']},'environmentBaseline':copy.deepcopy(baseline),'integrationBaseline':None,'temporaryGrants':[],'activation':[],'restore':[]}
 if 'grantRenewalPreimages' in facts:a['grantRenewalPreimages']=copy.deepcopy(facts['grantRenewalPreimages'])
 for permission,gid in facts['grantIdentities'].items():
  a['temporaryGrants'].append({'admin_grant_id':gid,'actor_id':actor,'environment':'DEV','permission':permission,'grant_revision':1,'expires_at':facts['outerExpiresAt'],'revoked_at':None,'created_at':facts['outerStartsAt'],'created_by':facts['grantorActorId']})
 if a.get('grantRenewalPreimages'):
  if set(a['grantRenewalPreimages'])!={'CONFIG_ADMIN','SECURITY_ADMIN'}:raise ValueError('EXACT_TWO_RENEWAL_PREIMAGES_REQUIRED')
  for r in a['temporaryGrants']:
   prior=a['grantRenewalPreimages'][r['permission']]
   for key in ['admin_grant_id','actor_id','environment','permission']:
    if prior[key]!=r[key]:raise ValueError('GRANT_RENEWAL_IDENTITY_DRIFT')
   r.update(grant_revision=prior['grant_revision']+1,created_at=prior['created_at'],created_by=prior['created_by'])
 if existing:
  a['integrationBaseline']=copy.deepcopy(facts['integrationBaseline']);a['priceBaselineVersion']=facts['priceBaselineVersion']
  a['retainedConfiguration']={'providerConfigId':c['provider_config_id'],'providerConfigurationSHA256':c['configuration_sha256'],'integrationConfigSHA256':i['config_sha256']}
 for n,name in enumerate(ORDER):
  if existing and n<2:continue
  kind=['external_integration_configure','intelligence_provider_config_append','external_integration_price_append',*(['external_integration_set_kill']*4)][n]
  identity=facts['commandIdentities'][name]
  cmd={'version':1,'environment':'DEV','request_id':identity['requestId'],'actor_id':actor,'integration_id':None if n in [4,5] else integration,'expected_version':[None,None,facts['priceBaselineVersion'] if existing else None,a['integrationBaseline']['config_version'] if existing else 1,baseline['config_version'],baseline['config_version']+1,(a['integrationBaseline']['config_version'] if existing else 1)+1][n],'audit_id':identity['auditId'],'reason_code':facts['reasonCode']}
  if n<3:cmd['row']=rows[['integration','provider','price'][n]]
  if n==2:cmd['units']=units
  if n>=3:cmd['kill_switch']=n>=5
  cmd['request_sha256']=command_hash(cmd)
  ctx={**copy.deepcopy(auth),'request_id':cmd['request_id'],'request_sha256':cmd['request_sha256'],'command_kind':kind,'gateway_identity':ADMIN}
  a['activation' if n<5 else 'restore'].append({'kind':kind,'command':cmd,'context':ctx})
 p['adminControl']=a
 validate_admin(p)
 # Existing watcher hashes and plan identity only; never grant ownerAuthorized here.
 p['helperHashes']={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in ['universal_scope_close.py','universal_runtime_close.py','universal_watchdog.py','universal_config_control.py']}
 p['windowId']=sha(canonical({k:v for k,v in p.items() if k not in ['windowId','ownerAuthorized']}))
 validate(p)
 return p

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--bind-proposed',action='store_true');parser.add_argument('--plan',required=True);parser.add_argument('--facts',required=True);parser.add_argument('--out',required=True);a=parser.parse_args()
 if not a.bind_proposed:raise ValueError('EXPLICIT_LOCAL_BINDING_REQUIRED')
 # No service/credential file is opened. These inputs must contain only facts/references.
 def read(path):
  p=Path(path)
  if p.is_symlink() or not p.is_file() or p.stat().st_size>262144:raise ValueError('BOUNDED_REGULAR_INPUT_REQUIRED')
  return json.loads(p.read_text())
 result=build_admin_plan(read(a.plan),read(a.facts));body=canonical(result)
 out=Path(a.out).absolute();st=out.parent.lstat()
 if out.parent.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o777!=0o700:raise ValueError('PRIVATE_OUTPUT_REQUIRED')
 fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fsync(f.fileno())
 print(json.dumps({'status':'PROPOSED_ADMIN_CONTROL_BOUND_NOT_AUTHORITY_OR_DEV_PASS','windowId':result['windowId'],'planSHA256':sha(body)}))
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'status':'ADMIN_BINDING_REFUSED_NO_EXECUTION'}));raise SystemExit(2)
