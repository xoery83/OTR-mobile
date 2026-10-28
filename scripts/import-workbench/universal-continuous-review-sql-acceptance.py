"""Focused local SQL candidate checks; existing network-none 256 MiB PG fixture only.

This exercises new policy mode, not another hosted Golden Slice or paid call.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
base = ROOT / 'scripts/import-workbench/universal-p6-source-sql-acceptance.py'
source = base.read_text()
start = source.index(' import os\n env=')
end = source.index("\n'''+source[source.index", start)
checks = r'''
 candidate=json.loads((MAIN_ROOT/'docs/ops/universal-product-20261028/authority/FIVE_FAMILY_POSTIMAGES_CANDIDATE.json').read_text())
 sql('set role postgres;'+';\\n'.join(candidate.values())+';')
 policy={'mode':'CONTINUOUS_MINIMUMS','version':1,'tripId':TRIP,'families':['P1','P3','P4','P5','P6'],'expiresAt':'2026-11-01T08:48:56Z'}
 def configure(value,enabled=True):
  sql('SET ROLE postgres;UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled='+('true' if enabled else 'false')+',universal_p1_review_scope='+literal(json.dumps(value))+'::jsonb WHERE actor_account_id='+literal(ACTOR)+'::uuid;')
 def capability(family,actor=ACTOR,trip=TRIP):
  return json.loads(sql("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;BEGIN;SELECT set_config('otr.core.actor',"+literal(actor)+",true),set_config('otr.core.trip',"+literal(trip)+",true),set_config('otr.universal.requested_family',"+literal(family)+",true);SELECT row_to_json(c)::text FROM public.trip_sustained_import_p1_capabilities("+literal(actor)+"::uuid,"+literal(trip)+"::uuid) c;ROLLBACK;",last=True))
 configure(policy,False)
 check('new mode remains closed behind existing policy boolean',not capability('P6')['runtime_enabled'])
 configure(policy)
 for family in policy['families']:
  c=capability(family)
  check('exact '+family+' capability narrows to only this family',c=={'runtime_enabled':True,'enabled_commands':['CREATE_ITEM'],'enabled_families':[family],'enabled_admission_modes':['REVIEWED_SOURCE']})
 for family in ['P2','P7','', 'MANUAL']:
  check('unsupported requested family stays closed '+family,not capability(family)['runtime_enabled'])
 check('cross Account stays closed',not capability('P6',OTHER)['runtime_enabled'])
 check('cross Trip stays closed',not capability('P6',ACTOR,str(uuid.uuid4()))['runtime_enabled'])
 for key,value in [('mode','OTHER'),('version',2),('families',['P1','P2','P3','P4','P5','P6']),('tripId',str(uuid.uuid4())),('expiresAt','2000-01-01T00:00:00Z'),('targetId',str(uuid.uuid4()))]:
  configure({**policy,key:value})
  check('policy alteration closed '+key,not capability('P1')['runtime_enabled'])
 configure(policy)
 # A capability alone is not Source Review/Plan authority; actual row guards remain mandatory.
 sql("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;BEGIN;SELECT set_config('otr.core.actor',"+literal(ACTOR)+",true),set_config('otr.core.trip',"+literal(TRIP)+",true),set_config('otr.universal.requested_family','P6',true);SET LOCAL ROLE otr_trip_core_v2_writer;SELECT public.trip_sustained_import_p1_guard('itinerary_events','INSERT','{}'::jsonb,null,"+literal(ACTOR)+"::uuid,"+literal(TRIP)+"::uuid);ROLLBACK;",failure='P1_SOURCE_CAPABILITY_CLOSED')
 check('capability without real review command target Source and Plan cannot write')
 configure(None,False)
 check('kill switch closes continuous capability',not capability('P6')['runtime_enabled'])
 import os
 env={**os.environ,'OTR_UNIVERSAL_CONTINUOUS_REVIEW_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P6_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_OWNED_SQL_FIXTURE':NAME,'OTR_UNIVERSAL_P1_FIXTURE_ACTOR':ACTOR,'OTR_UNIVERSAL_P1_FIXTURE_TRIP':TRIP}
 result=subprocess.run([str(MAIN_ROOT/'node_modules/.bin/vitest'),'run','--configLoader','runner','--maxWorkers=1','backend/src/universalP1SourcePg.sql.test.ts'],cwd=MAIN_ROOT,env=env,capture_output=True,text=True,timeout=150)
 print(result.stdout);assert result.returncode==0,result.stdout+result.stderr
 check('new unpinned P6 Source Plan Admission Core receipt and recovery use owning predicates')
 print(json.dumps({'status':'CONTINUOUS_FIVE_FAMILY_POLICY_PG_PASS_NOT_DEV','network':'none','memory':'256m','checks':checks}))
'''
# Base fixture's sql helper returns scalar stdout; use a psql tuple that emits only JSON.
checks = checks.replace(',last=True)', ').splitlines()[-1]')
source = source[:start] + checks + source[end:]
exec(compile(source, str(base), 'exec'), {'__file__': str(base), '__name__': '__main__'})
