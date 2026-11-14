-- Disposable PostgreSQL fixture for the two owning predicates only.
CREATE SCHEMA auth;
CREATE SCHEMA otr_auth_guest_composite;
CREATE FUNCTION otr_auth_guest_composite.has_scope() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION otr_auth_guest_composite.scope_allowed(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE ROLE otr_trip_core_v2_gateway LOGIN NOINHERIT CONNECTION LIMIT 1;
CREATE ROLE otr_trip_core_v2_writer NOLOGIN NOINHERIT;
GRANT otr_trip_core_v2_writer TO otr_trip_core_v2_gateway WITH INHERIT FALSE, SET TRUE;
CREATE ROLE anon;
CREATE ROLE supabase_admin;
CREATE ROLE authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE public.trip_sustained_dev_policy(actor_account_id uuid, enabled boolean, revoked_at timestamptz);
CREATE TABLE public.trips(id uuid, created_by uuid);
CREATE TABLE public.trip_members(trip_id uuid,user_id uuid);
CREATE TABLE public.trip_create_receipts(actor_account_id uuid, trip_id uuid, request_payload jsonb, operation_id uuid);
CREATE TABLE public.journey_members(trip_id uuid,user_id uuid,status text,role text);
CREATE TABLE public.journey_removed_users(trip_id uuid,user_id uuid);
INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001',false,null,null),
 ('00000000-0000-4000-8000-000000000002',false,null,null),
 ('00000000-0000-4000-8000-000000000003',true,null,null),
 ('00000000-0000-4000-8000-000000000004',false,null,null);
INSERT INTO public.trips VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000004');
INSERT INTO public.journey_members VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','linked','owner'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','linked','group_member'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003','linked','owner'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000004','linked','owner');
INSERT INTO public.journey_removed_users VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000004');
CREATE FUNCTION otr_auth_guest_composite.mutation_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
GRANT USAGE ON SCHEMA otr_auth_guest_composite TO otr_trip_core_v2_writer;
CREATE FUNCTION public.trip_core_event_row_valid(jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.trip_core_source_review_row_allowed(text,text,jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.trip_core_actor_has_trip(actor uuid,trip uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked')
$$;
CREATE TABLE public.trip_core_activation_gate(singleton boolean,runtime_enabled boolean);
CREATE TABLE public.itinerary_events(id uuid PRIMARY KEY,trip_id uuid,owner_account_id uuid,business_contract_version int,experience_family text,semantic_revision bigint,title text,created_at timestamptz,updated_at timestamptz);
CREATE TABLE public.trip_operational_documents(id uuid PRIMARY KEY,trip_id uuid,owner_account_id uuid,custody text,visibility text);
CREATE TABLE public.trip_item_document_links(trip_id uuid,item_id uuid,document_id uuid,linked_by uuid,active boolean);
CREATE TABLE public.trip_core_command_receipts(trip_id uuid,actor_account_id uuid,operation_id uuid PRIMARY KEY,body jsonb);
GRANT SELECT ON public.trip_core_activation_gate TO otr_trip_core_v2_writer;
GRANT SELECT,INSERT,UPDATE ON public.itinerary_events,public.trip_operational_documents,public.trip_item_document_links,public.trip_core_command_receipts TO otr_trip_core_v2_writer;
INSERT INTO public.itinerary_events VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',2,'P1',1,'Owner original',now(),now()),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002',2,'P1',1,'Editor original',now(),now());
CREATE TABLE public.trip_flight_intents(event_id uuid,trip_id uuid,qualification text);
CREATE TABLE public.trip_booking_item_links(trip_id uuid,item_id uuid,active boolean);
CREATE TABLE public.itinerary_transport_services(trip_id uuid,event_id uuid);
ALTER TABLE public.trip_core_command_receipts ADD COLUMN outcome text,ADD COLUMN command_version int,ADD COLUMN intent_version int,ADD COLUMN receipt_version int,ADD COLUMN canonical_intent_text text,ADD COLUMN intent_sha256 text,ADD COLUMN receipt_sha256 text;
ALTER TABLE public.itinerary_events ADD COLUMN temporal_shape text;
GRANT SELECT ON public.trip_flight_intents,public.trip_booking_item_links,public.itinerary_transport_services TO otr_trip_core_v2_writer;
