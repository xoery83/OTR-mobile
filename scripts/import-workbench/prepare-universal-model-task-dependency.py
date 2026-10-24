"""Render the existing dormant Model Task migration with preserved owner edges.
Local file generation only; this script has no DB, Auth, network or deploy entry.
"""
from pathlib import Path
import hashlib
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'supabase/migrations/20261012000100_model_task_protected_admission.sql'
TARGET = ROOT / 'backend/sql/universal_model_task_dependency_candidate.sql'
EXPECTED = 'efee375bec1da7c12d33e7d7994d8983ad9fb32ba7851a56cc4f82b550d65e94'
original = SOURCE.read_text()
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED, 'OWNING_MIGRATION_HASH_DRIFT'
prefix = """-- CANDIDATE ONLY: existing CP-LLM owning migration, no activation permission.
-- Owning SQL SHA256 efee375bec1da7c12d33e7d7994d8983ad9fb32ba7851a56cc4f82b550d65e94.
-- Only wrapper delta: fixed dependency preimages + preserve current owner edges/ACL.
"""
preflight = """begin;
create temporary table universal_model_task_edges on commit drop as
 select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members
 where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole;
do $preflight$begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'MODEL_DEPENDENCY_OPERATOR';end if;
 if to_regclass('public.model_task_admissions') is not null
 or to_regprocedure('public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean)') is not null
 or to_regprocedure('public.cp_llm_guard_model_task_admissions()') is not null then raise exception 'MODEL_DEPENDENCY_ALREADY_PRESENT';end if;
 if has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') then raise exception 'MODEL_DEPENDENCY_CREATE_PREIMAGE';end if;
 if (select md5(prosrc) from pg_proc where oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure) is distinct from 'fc23b6a0b1de7cca90de51ce80ea6fe6'
 or (select md5(prosrc) from pg_proc where oid='public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure) is distinct from '03f32879084ffeed49cc0dcc459e941e' then raise exception 'MODEL_DEPENDENCY_ROOT_PREIMAGE';end if;
 if not exists(select 1 from public.external_integration_environment_state where environment='DEV' and kill_switch and not runtime_enabled) then raise exception 'MODEL_DEPENDENCY_NOT_CLOSED';end if;
end $preflight$;
"""
restore = """do $restore$declare old record;begin
 select * into old from pg_temp.universal_model_task_edges where grantor='postgres'::regrole;
 if found then
  execute format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',case when old.admin_option then 'true' else 'false' end,case when old.inherit_option then 'true' else 'false' end,case when old.set_option then 'true' else 'false' end);
 else revoke otr_external_integration_meter_writer from postgres;end if;
 if exists((select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole except select * from pg_temp.universal_model_task_edges)
 union all (select * from pg_temp.universal_model_task_edges except select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole)) then raise exception 'MODEL_DEPENDENCY_MEMBERSHIP_DRIFT';end if;
 if has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') then raise exception 'MODEL_DEPENDENCY_CREATE_DRIFT';end if;
end $restore$;
"""
assert original.count('begin;\n') == 1
assert original.count('revoke otr_external_integration_meter_writer from postgres;\n') == 1
candidate = prefix + original.replace('begin;\n', preflight, 1).replace('revoke otr_external_integration_meter_writer from postgres;\n', restore, 1)
TARGET.write_text(candidate)
print(hashlib.sha256(candidate.encode()).hexdigest())
