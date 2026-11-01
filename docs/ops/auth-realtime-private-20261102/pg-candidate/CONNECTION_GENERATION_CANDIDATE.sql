-- CANDIDATE ONLY. No Hosted approval or execution. Canonical membership remains the authority.
BEGIN;

CREATE TABLE public.trip_realtime_liveness(
 account_id uuid NOT NULL REFERENCES auth.users(id),trip_id uuid NOT NULL REFERENCES public.trips(id),
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),PRIMARY KEY(account_id,trip_id));
CREATE FUNCTION public.otr_realtime_generation_owner_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF current_user<>'postgres' OR new.account_id<>old.account_id OR new.trip_id<>old.trip_id OR new.generation<>old.generation+1 THEN RAISE EXCEPTION 'CANONICAL_REALTIME_GENERATION_WRITER_REQUIRED';END IF;RETURN new;END$$;
REVOKE ALL ON FUNCTION public.otr_realtime_generation_owner_guard() FROM public,anon,authenticated,service_role;
CREATE TRIGGER owner_writer BEFORE UPDATE ON public.trip_realtime_liveness FOR EACH ROW EXECUTE FUNCTION public.otr_realtime_generation_owner_guard();
CREATE TABLE public.trip_realtime_transitions(
 receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES auth.users(id),trip_id uuid NOT NULL REFERENCES public.trips(id),
 actor_person_id uuid NOT NULL REFERENCES public.journey_members(id),kind text NOT NULL CHECK(kind IN ('REVOKED','REGRANTED')),
 previous_generation bigint NOT NULL CHECK(previous_generation BETWEEN 1 AND 9007199254740990),
 generation bigint NOT NULL CHECK(generation=previous_generation+1 AND generation<=9007199254740991),
 UNIQUE(account_id,trip_id,operation_id));
CREATE FUNCTION public.otr_realtime_transition_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'FIXTURE_TRANSITION_IMMUTABLE';END$$;
REVOKE ALL ON FUNCTION public.otr_realtime_transition_immutable() FROM public,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.trip_realtime_transitions FOR EACH ROW EXECUTE FUNCTION public.otr_realtime_transition_immutable();
ALTER TABLE public.trip_realtime_liveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_realtime_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_realtime_liveness,public.trip_realtime_transitions FROM public,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.trip_realtime_liveness TO otr_trip_core_v2_gateway;
GRANT SELECT ON public.trip_realtime_transitions TO otr_trip_core_v2_gateway;
CREATE POLICY scoped ON public.trip_realtime_liveness TO otr_trip_core_v2_gateway USING(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid) WITH CHECK(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
CREATE POLICY scoped ON public.trip_realtime_transitions FOR SELECT TO otr_trip_core_v2_gateway USING(account_id=nullif(current_setting('otr.core.actor',true),'')::uuid AND trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
COMMIT;
