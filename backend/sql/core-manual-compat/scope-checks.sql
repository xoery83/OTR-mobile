-- Run after scope-fixture.sql and the forward definitions. No remote state.
SET SESSION AUTHORIZATION otr_trip_core_v2_gateway;
DO $$
DECLARE
 owner_id uuid:='00000000-0000-4000-8000-000000000001';
 member_id uuid:='00000000-0000-4000-8000-000000000002';
 guest_id uuid:='00000000-0000-4000-8000-000000000003';
 removed_id uuid:='00000000-0000-4000-8000-000000000004';
 trip_id uuid:='00000000-0000-4000-8000-000000000010';
 kind text;
BEGIN
 PERFORM set_config('otr.core.actor',owner_id::text,true);
 PERFORM set_config('otr.core.trip',trip_id::text,true);
 IF public.trip_sustained_dev_scope_allowed(owner_id,trip_id,null,'CORE') IS NOT FALSE THEN RAISE EXCEPTION 'unmarked legacy bypass'; END IF;
 PERFORM set_config('otr.core.manual_compat','MANUAL',true);
 FOREACH kind IN ARRAY ARRAY['CORE','CORE_P2','CORE_P3','CORE_P4','CORE_P5','CORE_P6'] LOOP
  IF public.trip_sustained_dev_scope_allowed(owner_id,trip_id,null,kind) IS NOT TRUE THEN RAISE EXCEPTION 'manual owner denied: %',kind; END IF;
 END LOOP;
 IF public.trip_sustained_dev_scope_allowed(owner_id,gen_random_uuid(),null,'CORE') IS NOT FALSE THEN RAISE EXCEPTION 'cross-trip accepted'; END IF;
 IF public.trip_sustained_core_read_scope_allowed(owner_id,trip_id) IS NOT FALSE THEN RAISE EXCEPTION 'write flag altered member read'; END IF;
 PERFORM set_config('otr.core.manual_compat','READ',true);
 IF public.trip_sustained_core_read_scope_allowed(owner_id,trip_id) IS NOT TRUE THEN RAISE EXCEPTION 'normal owner read denied'; END IF;
 PERFORM set_config('otr.core.actor',member_id::text,true);
 IF public.trip_sustained_core_read_scope_allowed(member_id,trip_id) IS NOT TRUE OR public.trip_sustained_dev_scope_allowed(member_id,trip_id,null,'CORE') IS NOT TRUE THEN RAISE EXCEPTION 'linked editor denied'; END IF;
 PERFORM set_config('otr.core.actor',guest_id::text,true);
 IF public.trip_sustained_core_read_scope_allowed(guest_id,trip_id) IS NOT FALSE OR public.trip_sustained_dev_scope_allowed(guest_id,trip_id,null,'CORE') IS NOT FALSE THEN RAISE EXCEPTION 'anonymous accepted'; END IF;
 PERFORM set_config('otr.core.actor',removed_id::text,true);
 IF public.trip_sustained_core_read_scope_allowed(removed_id,trip_id) IS NOT FALSE OR public.trip_sustained_dev_scope_allowed(removed_id,trip_id,null,'CORE') IS NOT FALSE THEN RAISE EXCEPTION 'revoked member accepted'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SELECT 'CORE_MANUAL_SCOPE_COMPAT_PASS';
