# Executed only inside the existing disposable network-none fixture.
import importlib.util
base=pathlib.Path('/private/tmp/otr-p5-check-dispatch-20261029')
spec=importlib.util.spec_from_file_location('p5checks',base/'prepare_checks.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fields=module.FIELDS
names=["itinerary_transport_services_"+f+"_check" for f in fields]
constraint_read="SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'expression',pg_get_expr(conbin,conrelid),'validated',convalidated,'type',contype,'table',conrelid::regclass::text) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.itinerary_transport_services'::regclass AND conname IN ("+','.join(literal(n) for n in names)+");"
pre=json.loads(sql(constraint_read));(base/'constraint-preimages.json').write_text(json.dumps(pre,indent=2)+'\n');module.build()
sql('set role postgres;'+(base/'checks-install.sql').read_text())
post=json.loads(sql(constraint_read));(base/'constraint-postimages.json').write_text(json.dumps(post,indent=2)+'\n');module.build()
# Exact data-preserving rollback succeeds before any new exception facts are present.
sql('set role postgres;'+(base/'checks-rollback.sql').read_text())
check('five original CHECK predicates/validation restored exactly before new facts',json.loads(sql(constraint_read))==pre)
sql('set role postgres;'+(base/'checks-install.sql').read_text())
check('five CHECK install roundtrip is atomic/repeatable with exact postimage',json.loads(sql(constraint_read))==post)
