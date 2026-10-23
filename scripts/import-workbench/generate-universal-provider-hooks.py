"""Generate exact-preimage Universal branches, preserving each Flight body byte-for-byte."""
import hashlib
import pathlib
import re

ROOT=pathlib.Path(__file__).resolve().parents[2]
baseline=(ROOT/'supabase/migrations/20261012000100_model_task_protected_admission.sql').read_text()
candidate=ROOT/'backend/sql/universal_provider_admission_candidate.sql'
hooks={
 'cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean)': "if b->'profile'->>'execution_scope'='UNIVERSAL_IMPORT_V1' then perform public.universal_import_validate_binding(b,r,live);return;end if;",
 'cp_llm_guard_model_task_admissions()': """if tg_op='INSERT' and new.profile_snapshot->>'execution_scope'='UNIVERSAL_IMPORT_V1' then
 if session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_meter_writer' then raise exception 'MODEL_TASK_PROTECTED';end if;
 select * into r from public.external_integration_calls where call_id=new.call_id;
 perform public.universal_import_validate_binding(jsonb_build_object('version',1,'request',new.request_snapshot,'request_sha256',new.request_sha256,'profile',new.profile_snapshot,'profile_sha256',new.profile_sha256),r,true);
 if not coalesce(r.account_id=new.account_id and r.integration_id=new.integration_id and r.task_id=new.task_id
 and new.logical_request_id=(new.request_snapshot->>'logical_request_id')::uuid and new.logical_idempotency_key=(new.request_snapshot->>'logical_idempotency_key')::uuid
 and new.policy_sha256=new.request_snapshot->>'policy_sha256' and new.currency=new.request_snapshot->'policy_snapshot'->>'budget_currency'
 and new.max_cost_nanos=(new.request_snapshot->'policy_snapshot'->>'budget_nanos')::numeric and new.deadline=(new.request_snapshot->'policy_snapshot'->>'deadline')::timestamptz
 and exists(select 1 from public.external_integration_usage_events where call_id=new.call_id and observation_kind='START'),false) then raise exception 'MODEL_TASK_CHANGED_BINDING';end if;
 return new;
end if;""",
 'external_integration_mark_dispatch(jsonb,jsonb)': "if exists(select 1 from public.external_integration_calls c where c.call_id=(command->>'call_id')::uuid and c.task_class='UNIVERSAL_IMPORT_V1') then return public.universal_import_mark_dispatch(context,command);end if;",
}
parts=[]
for signature,hook in hooks.items():
 name=signature.split('(')[0]
 pattern=r'create(?: or replace)? function public\.'+name+r'\([^\n]*?\).*?as \$\$(.*?)\$\$;'
 match=re.search(pattern,baseline,re.I|re.S)
 assert match,name
 body=match.group(1)
 md5=hashlib.md5(body.encode()).hexdigest()
 # The hook is placed after the first PL/pgSQL BEGIN, before historical statements.
 hook='\n/* UNIVERSAL_BRANCH_BEGIN */\n'+hook+'\n/* UNIVERSAL_BRANCH_END */\n'
 escaped=hook.replace("'","''")
 parts.append("""do $universal_hook$
declare original text; patched text; definition text; boundary integer; hook text := '"""+escaped+"""';
begin
 select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public."""+signature+"""'::regprocedure;
 if md5(original)<>'"""+md5+"""' then raise exception 'UNIVERSAL_PROTECTED_ROOT_PREIMAGE: """+name+"""';end if;
 boundary:=position('begin' in lower(original))+4;
 if boundary<5 then raise exception 'UNIVERSAL_PROTECTED_ROOT_PARSE';end if;
 patched:=substr(original,1,boundary)||hook||substr(original,boundary+1);
 execute replace(definition,original,patched);
end $universal_hook$;""")
text=candidate.read_text()
begin='-- UNIVERSAL_PROTECTED_ROOT_HOOKS_BEGIN'
end='-- UNIVERSAL_PROTECTED_ROOT_HOOKS_END'
replacement=begin+'\n'+'\n'.join(parts)+'\n'+end
if begin in text:text=re.sub(re.escape(begin)+r'.*?'+re.escape(end),lambda _:replacement,text,flags=re.S)
else:text=text.replace('-- UNIVERSAL_PROTECTED_ROOT_HOOKS',replacement)
candidate.write_text(text)
