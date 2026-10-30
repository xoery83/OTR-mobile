"""Render exact function-preimage guarded patches for the disposable owning baseline."""
import hashlib
SIGNATURES=[
 'public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)',
 'public.trip_create_finite_scope_allowed(uuid,uuid,uuid)',
 'public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)',
 'public.trip_core_finite_scope_allowed(uuid,uuid)',
 'public.trip_create_command(uuid,uuid,uuid,jsonb)',
 'public.trip_create_result(uuid,uuid)',
 'public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)',
 'public.trip_metadata_snapshot(uuid,uuid,uuid)',
 'public.trip_metadata_update_result(uuid,uuid)',
 'public.trip_person_cloud_create_command(uuid,uuid,uuid,jsonb)',
 'public.trip_person_cloud_create_result(uuid,uuid,uuid)',
 'public.trip_person_create_receipt_guard()',
 'public.trip_core_finite_read_state_guard()',
]
SCOPE='otr_auth_guest_composite.scope_allowed'
def once(body,old,new):
 assert body.count(old)==1,'AUTH_PRINCIPAL_PATCH_PREIMAGE_MISMATCH:'+old
 return body.replace(old,new,1)
def enter(body,statement):
 marker='BEGIN\n' if 'BEGIN\n' in body else 'begin\n'
 return once(body,marker,marker+statement+'\n')
def render(definitions):
 result={}
 for signature,original in definitions.items():
  body=original
  if 'trip_sustained_dev_scope_allowed' in signature:
   body=enter(body,f" IF otr_auth_guest_composite.has_scope() THEN RETURN {SCOPE}(actor,trip,operation,kind);END IF;")
  elif 'finite_scope_allowed' in signature:
   kind='CREATE' if 'trip_create' in signature else 'METADATA' if 'trip_metadata' in signature else 'CORE'
   operation='null' if kind=='CORE' else 'operation'
   body=enter(body,f" IF otr_auth_guest_composite.has_scope() THEN RETURN {SCOPE}(actor,trip,{operation},'{kind}');END IF;")
  elif 'trip_create_command' in signature:
   body=once(body,"session_user<>'otr_trip_create_gateway'",f"session_user<>'otr_trip_create_gateway' AND NOT {SCOPE}(p_actor,p_trip,p_operation,'CREATE')")
   body=enter(body," IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(p_actor,p_trip,p_operation,'CREATE',p_request);END IF;")
  elif 'trip_create_result' in signature:
   body=once(body,"session_user<>'otr_trip_create_gateway'",f"session_user<>'otr_trip_create_gateway' AND NOT {SCOPE}(p_actor,null,p_operation,'CREATE')")
  elif 'trip_metadata_' in signature:
   trip='null' if 'update_result' in signature else 'p_trip'
   body=once(body,"session_user<>'otr_trip_metadata_gateway'",f"session_user<>'otr_trip_metadata_gateway' AND NOT {SCOPE}(p_actor,{trip},p_operation,'METADATA')")
   if 'update_command' in signature:
    body=enter(body," IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(p_actor,p_trip,p_operation,'METADATA',p_request);END IF;")
   if 'update_result' in signature:
    old='IF r.request_payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN'
    body=once(body,old,f"IF NOT {SCOPE}(p_actor,r.trip_id,p_operation,'METADATA') AND r.request_payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN")
  elif 'trip_person_cloud' in signature:
   body=once(body,"session_user<>'otr_trip_person_command_gateway'",f"(session_user<>'otr_trip_person_command_gateway' AND NOT {SCOPE}(actor,trip,operation,'PERSON'))")
   if 'command' in signature:
    body=enter(body," IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(actor,trip,operation,'PERSON',request);END IF;")
  elif 'trip_person_create_receipt_guard' in signature:
   body=once(body,"session_user<>'otr_trip_person_command_gateway'",f"(session_user<>'otr_trip_person_command_gateway' AND NOT {SCOPE}(NEW.actor_account_id,NEW.trip_id,NEW.operation_id,'PERSON'))")
  elif 'trip_core_finite_read_state_guard' in signature:
   marker=" trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;"
   extra="""
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
  IF TG_OP='INSERT' AND otr_auth_guest_composite.read_state_allowed(trip,'CREATE')
  AND NEW.revision=1 AND NEW.access_revision=1 THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND otr_auth_guest_composite.read_state_allowed(trip,'PERSON')
  AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
  AND NEW.access_revision=OLD.access_revision+1 THEN RETURN NEW;END IF;
 END IF;
"""
   body=once(body,marker,marker+extra)
  assert body!=original,signature
  result[signature]={'before':original,'after':body,'beforeMd5':hashlib.md5(original.encode()).hexdigest(),'afterMd5':hashlib.md5(body.encode()).hexdigest()}
 header="""-- DISPOSABLE BASELINE ONLY. This is NOT a Hosted DEV execution packet.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
 OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED';END IF;
END $$;
"""
 statements=[header]
 for signature,item in result.items():
  statements.append("DO $$ BEGIN IF md5(pg_get_functiondef('"+signature+"'::regprocedure)) IS DISTINCT FROM '"+item['beforeMd5']+"' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;")
  statements.append(item['after']+';')
 granted=[s for s in SIGNATURES if not any(x in s for x in ['trip_sustained','receipt_guard','read_state_guard'])]
 statements.append('GRANT EXECUTE ON FUNCTION '+','.join(granted)+' TO otr_trip_core_v2_gateway;')
 statements.append('COMMIT;')
 return '\n'.join(statements),result
