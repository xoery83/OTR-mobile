import json, sys
from pathlib import Path

sys.path.insert(0, '/Users/xoery/Project/otr-mobile-import/import-unified-renewal-20261103/docs/ops/import-unified-renewal-20261103/control/reuse')
from universal_scope_close import SqlTransport

out = Path('/private/tmp/otr-root2-fixed-handoff-verification-20261103')
out.mkdir(exist_ok=True)
query = """BEGIN READ ONLY;
SELECT jsonb_build_object(
 'observedAt',clock_timestamp(),'transactionReadOnly',current_setting('transaction_read_only'),
 'schemaTail',(SELECT jsonb_build_object('count',count(*),'maxVersion',max(version)) FROM supabase_migrations.schema_migrations),
 'sourceFunctions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.proname,'owner',pg_get_userbyid(p.proowner),'definitionSHA256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(66408,66410,66868,67144,67149)),
 'scopes',(SELECT jsonb_agg(t ORDER BY t.scope_id) FROM (SELECT DISTINCT ON(scope_id) scope_id,revision,active,expires_at,expires_at<=clock_timestamp() AS expired,integration_id,provider_id,price_schedule_id,pins->>'search_price_schedule_id' AS search_price_schedule_id FROM public.flight_activation_scopes WHERE scope_id IN('baac2ca8-f769-4ace-8bd4-d394a36312d6','ce76c38a-3705-4c3f-84d0-f4ff462192b6') ORDER BY scope_id,revision DESC) t),
 'actorGrants',(SELECT jsonb_agg(t ORDER BY t.scope_id) FROM (SELECT DISTINCT ON(scope_id,account_id) scope_id,account_id,revision,revoked,expires_at,expires_at<=clock_timestamp() AS expired FROM public.flight_activation_account_grants WHERE (scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6' AND account_id='f4b059c5-8241-4ffb-aa15-37fa25474543') OR (scope_id='ce76c38a-3705-4c3f-84d0-f4ff462192b6' AND account_id='3f7e964e-79d3-4028-a585-470e798e41ec') ORDER BY scope_id,account_id,revision DESC) t),
 'sourcePolicy',(SELECT jsonb_build_object('enabled',enabled,'revoked',revoked_at IS NOT NULL,'universal',universal_import_enabled,'pdf',universal_pdf_import_enabled,'png',universal_png_import_enabled,'pngExpiry',universal_png_import_expires_at,'admission',universal_p1_review_scope) FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'),
 'roleBaseline',(SELECT jsonb_build_object('oid',oid,'login',rolcanlogin,'connectionLimit',rolconnlimit,'expiresAt',rolvaliduntil,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'inherit',rolinherit) FROM pg_roles WHERE oid=57852),
 'maintenanceGrants',(SELECT jsonb_agg(jsonb_build_object('permission',permission,'revision',grant_revision,'revoked',revoked_at IS NOT NULL,'expiresAt',expires_at) ORDER BY permission) FROM public.external_integration_admin_grants WHERE admin_grant_id IN('d54496c1-273e-4181-a00c-6c76c022965c','d596e9f4-643e-4395-9428-e0c6acea0648')),
 'adminSessionCount',(SELECT count(*) FROM pg_stat_activity WHERE usename='otr_external_integration_admin_gateway'),
 'issuerFunction',(SELECT jsonb_build_object('oid',oid,'owner',pg_get_userbyid(proowner),'bodyMD5',md5(prosrc),'definitionSHA256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'securityDefiner',prosecdef,'config',proconfig) FROM pg_proc WHERE oid=to_regprocedure('public.otr_mcp_qa_access_token(jsonb)')),
 'prices',(SELECT jsonb_agg(jsonb_build_object('id',price_schedule_id,'expiresAt',effective_until,'expired',effective_until<=clock_timestamp(),'sha256',schedule_sha256) ORDER BY price_schedule_id) FROM public.external_integration_price_schedules WHERE integration_id IN(SELECT DISTINCT ON(scope_id) integration_id FROM public.flight_activation_scopes WHERE scope_id IN('baac2ca8-f769-4ace-8bd4-d394a36312d6','ce76c38a-3705-4c3f-84d0-f4ff462192b6') ORDER BY scope_id,revision DESC))
) AS result;
ROLLBACK;"""
assert query.startswith('BEGIN READ ONLY;') and query.rstrip().endswith('ROLLBACK;')
assert not any(x in query.upper() for x in ['INSERT ', 'UPDATE ', 'DELETE ', 'ALTER ', 'CREATE ', 'GRANT ', 'REVOKE '])
transport = SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase', '/Users/xoery/Project/otr-mobile-universal-handoff-20261026', str(out))
result = transport(query)
(out/'PG_INDEPENDENT.json').write_text(json.dumps(result,indent=2)+'\n')
row = result['rows'][0]['result']
print(json.dumps(row,indent=2))
