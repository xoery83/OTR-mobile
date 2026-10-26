"""Exact approved DEV role and temporary Admin setup SQL; inert renderer."""
import json
from universal_scope_close import quote
from universal_continuous_sql_ports import validate_sql_plan
from universal_continuous_transition import ACTOR,canonical,instant
from universal_config_control import grant_preimage_sql

def render(plan):
 validate_sql_plan(plan)
 a=plan['adminControl'];roles=['otr_trip_source_command_gateway','otr_external_integration_call_gateway','otr_external_integration_admin_gateway']
 guards=["current_user<>'postgres'",f"clock_timestamp()<{quote(plan['startsAt'])}::timestamptz",f"clock_timestamp()>={quote(plan['expiresAt'])}::timestamptz-interval '240 seconds'"]
 for name in roles:
  guards += [f"NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname={quote(name)} AND NOT rolcanlogin AND rolconnlimit=1 AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)",f"EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename={quote(name)})"]
 guards += [f"EXISTS(SELECT 1 FROM public.external_integration_admin_grants WHERE actor_id={quote(ACTOR)}::uuid AND environment='DEV' AND admin_grant_id NOT IN ("+','.join(quote(g['admin_grant_id'])+'::uuid' for g in a['temporaryGrants'])+"))"]
 for g in a['temporaryGrants']:
  prior=a['grantRenewalPreimages'][g['permission']]
  guards.append("NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+quote(g['admin_grant_id'])+"::uuid AND "+grant_preimage_sql(prior)+")")
 locks=''.join("PERFORM 1 FROM public.external_integration_admin_grants WHERE admin_grant_id="+quote(g['admin_grant_id'])+"::uuid FOR UPDATE;" for g in a['temporaryGrants'])
 guard='DO $guard$ BEGIN '+locks+'IF '+' OR '.join(guards)+" THEN RAISE EXCEPTION 'UNIVERSAL_ROLE_SETUP_PREIMAGE';END IF;END $guard$;"
 statements=[]
 for name in roles:
  until=a['expiresAt'] if name=='otr_external_integration_admin_gateway' else 'infinity'
  statements.append(f"ALTER ROLE {name} LOGIN CONNECTION LIMIT 1 VALID UNTIL {quote(until)};")
 for row in a['temporaryGrants']:
  prior=a['grantRenewalPreimages'][row['permission']]
  statements.append("UPDATE public.external_integration_admin_grants g SET expires_at="+quote(row['expires_at'])+"::timestamptz,revoked_at=NULL,grant_revision="+str(row['grant_revision'])+" WHERE admin_grant_id="+quote(row['admin_grant_id'])+"::uuid AND "+grant_preimage_sql(prior)+";")
 return "BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SELECT pg_advisory_xact_lock(714025,4);"+guard+''.join(statements)+'COMMIT;'
