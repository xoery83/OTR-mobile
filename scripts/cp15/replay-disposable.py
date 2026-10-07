"""Reuse exact CP14 platform replay in a NEW task-owned network-none container.
python3 scripts/cp15/replay-disposable.py [seeded|targeted]
Requires the local pinned image/schema-only platform fixture. Never hosted/live.
"""
from pathlib import Path
import sys,json
root=Path(__file__).resolve().parents[2]
seeded=sys.argv[1:]==['seeded']
assert not sys.argv[1:] or seeded or sys.argv[1:]==["targeted"]
container='otr-cp15-targeted' if sys.argv[1:]==['targeted'] else 'otr-cp15-seeded' if seeded else 'otr-cp15-acceptance'
source=(root/'scripts/cp14/replay-disposable.py').read_text().replace('otr-cp14-acceptance',container)
# Read only hash-pinned platform definitions from the retained isolated fixture.
source=source.replace("original=Path", "assert subprocess.check_output(['docker','inspect','otr-cp13a-acceptance-review','--format','{{.HostConfig.NetworkMode}}'],text=True).strip()=='none'\noriginal=Path")
# Reuse original clients exactly, apart from omitting the new nullable column on84.
def accepted83_source(target):
 return (root/'scripts/cp14/persistence-acceptance.py').read_text().replace("CONTAINER='otr-cp14-acceptance'",f"CONTAINER='{target}'")
rows_sql="""do $$declare t record;begin create temporary table cp15_preservation(table_name text, rows jsonb);for t in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' loop execute format('insert into cp15_preservation select %L,coalesce(jsonb_agg(v order by v::text),''[]''::jsonb) from (select to_jsonb(r)-''provider_request_id'' v from public.%I r) s',t.table_name,t.table_name);end loop;end$$;select jsonb_object_agg(table_name,rows) from cp15_preservation;"""
columns_sql="select jsonb_object_agg(table_name,(select jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) order by ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name)) from information_schema.tables t where table_schema='public' and table_type='BASE TABLE';"
functions_sql="select jsonb_object_agg(p.oid::regprocedure::text,encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';"
hook='''
 if n==83:
  if SEEDED:
   namespace={'__file__':str(root/'scripts/cp14/persistence-acceptance.py')}
   exec(compile(accepted83_source(CONTAINER),namespace['__file__'],'exec'),namespace)
  preserved_rows=json.loads(sql(ROWS_SQL))
  preserved_columns=json.loads(sql(COLUMNS_SQL))
  preserved_functions=json.loads(sql(FUNCTIONS_SQL))
 if n==84:
  now_rows=json.loads(sql(ROWS_SQL));assert all(now_rows[k]==v for k,v in preserved_rows.items())
  now_columns=json.loads(sql(COLUMNS_SQL))
  for k,v in preserved_columns.items():
   current=now_columns[k]
   if k=='external_integration_usage_events':current=[c for c in current if c[0]!='provider_request_id']
   assert current==v,k
  now_functions=json.loads(sql(FUNCTIONS_SQL))
  changed={'public.cp14_guard_external_integration_environment_state()','public.cp14_bind_request(jsonb,jsonb)','public.external_integration_mark_dispatch(jsonb,jsonb)','public.external_integration_usage_append(jsonb,jsonb)'}
  assert all(now_functions[k]==v for k,v in preserved_functions.items() if k.removeprefix('public.') not in {v.removeprefix('public.') for v in changed})
  assert sql("select count(*) from public.external_integration_environment_state where runtime_enabled;")=='0'
  assert sql("select count(*) from public.flight_activation_scopes;")=='0'
  assert sql("select count(*) from public.flight_activation_account_grants;")=='0'
  assert sql("select count(*) from public.flight_call_resource_holds;")=='0'
  assert sql("select kill_switch from public.external_integration_environment_state where environment='DEV';")=='t'
  print('PASS seeded83→84 preservation' if SEEDED else 'PASS fresh1→84 / defaults CLOSED',flush=True)
'''
source=source.replace(" if n in (1,62,74,82,83):",hook+"\n if n in (1,62,74,82,83):")
exec(compile(source,str(root/'scripts/cp14/replay-disposable.py'),'exec'),{'__file__':__file__,'SEEDED':seeded,'CONTAINER':container,'ROWS_SQL':rows_sql,'COLUMNS_SQL':columns_sql,'FUNCTIONS_SQL':functions_sql,'accepted83_source':accepted83_source})
