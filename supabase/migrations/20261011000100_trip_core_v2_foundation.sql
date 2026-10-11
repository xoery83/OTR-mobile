-- Core85 additive foundation. Historical functions/migrations retained. Runtime CLOSED.

begin;

alter table public.itinerary_events add column owner_account_id uuid;

alter table public.itinerary_events add column visibility text check(visibility in ('PRIVATE','GROUP','SELECTED_PERSONS'));

alter table public.itinerary_events add column hidden_at timestamptz(6);

alter table public.itinerary_events add column field_state jsonb check(jsonb_typeof(field_state)='object' and octet_length(field_state::text)<=32768);

alter table public.itinerary_events add column business_contract_version smallint check(business_contract_version=2);

alter table public.itinerary_events add column experience_family text check(experience_family in ('P1','P2','P3','P4','P5','P6'));

alter table public.itinerary_events add column participation_mode text check(participation_mode in ('WHOLE_GROUP','SELECTED_MEMBERS','SELF'));

alter table public.itinerary_events add column self_person_id uuid;

alter table public.itinerary_events add column activity_category text check(activity_category in ('POI','DINING','SHOPPING','HIKE','APPOINTMENT','GENERAL'));

alter table public.itinerary_transport_endpoints add column trip_id uuid;

create table public.trip_endpoint_details (
 airport_code text check(char_length(airport_code)<=8),
 terminal text check(char_length(terminal)<=128),
 platform text check(char_length(platform)<=128),
 pier text check(char_length(pier)<=128),
 event_id uuid not null,
 trip_id uuid not null,
 role text not null check(role in ('ORIGIN','DESTINATION')),
 primary key(event_id,role)
);

create table public.trip_flight_intents (
 event_id uuid not null,
 trip_id uuid not null,
 flight_number_literal text not null check(char_length(flight_number_literal)<=255),
 qualification text not null check(qualification in ('SPARSE','QUALIFIED')),
 primary key(event_id)
);

alter table public.itinerary_transport_services add column trip_id uuid;

create table public.trip_stay_details (
 event_id uuid not null,
 trip_id uuid not null,
 property_name text check(char_length(property_name)<=500),
 permitted_checkin_from time(6),
 permitted_checkin_until time(6),
 permitted_checkout_by time(6),
 primary key(event_id)
);

create table public.trip_stay_rooms (
 event_id uuid not null,
 trip_id uuid not null,
 room_id uuid not null,
 category text check(char_length(category)<=500),
 quantity integer check(quantity > 0),
 capacity integer check(capacity > 0),
 primary key(event_id,room_id)
);

create table public.trip_rental_details (
 event_id uuid not null,
 trip_id uuid not null,
 supplier text check(char_length(supplier)<=500),
 reserved_category text check(char_length(reserved_category)<=500),
 or_similar boolean,
 actual_vehicle_model text check(char_length(actual_vehicle_model)<=500),
 verified_plate text check(char_length(verified_plate)<=64),
 primary key(event_id)
);

create table public.trip_activity_details (
 event_id uuid not null,
 trip_id uuid not null,
 session_label text check(char_length(session_label)<=500),
 admission_note text check(char_length(admission_note)<=2000),
 primary key(event_id)
);

create table public.trip_rental_places (
 event_id uuid not null,
 trip_id uuid not null,
 role text not null check(role in ('PICKUP','RETURN')),
 authored_label text check(char_length(authored_label)<=500),
 authored_text text check(char_length(authored_text)<=5000),
 authored_address text check(char_length(authored_address)<=2000),
 accepted_address text check(char_length(accepted_address)<=2000),
 accepted_latitude double precision check(accepted_latitude between -90 and 90),
 accepted_longitude double precision check(accepted_longitude between -180 and 180),
 accepted_place_id uuid,
 spatial_provenance_refs jsonb check(jsonb_typeof(spatial_provenance_refs)='object' and octet_length(spatial_provenance_refs::text)<=32768),
 location_input_revision bigint check(location_input_revision between 1 and 9007199254740991),
 authored_address_line1 text check(char_length(authored_address_line1)<=500),
 authored_address_line2 text check(char_length(authored_address_line2)<=500),
 authored_address_locality text check(char_length(authored_address_locality)<=200),
 authored_address_region text check(char_length(authored_address_region)<=200),
 authored_address_postal_code text check(char_length(authored_address_postal_code)<=64),
 authored_address_country text check(char_length(authored_address_country)<=128),
 accepted_address_line1 text check(char_length(accepted_address_line1)<=500),
 accepted_address_line2 text check(char_length(accepted_address_line2)<=500),
 accepted_address_locality text check(char_length(accepted_address_locality)<=200),
 accepted_address_region text check(char_length(accepted_address_region)<=200),
 accepted_address_postal_code text check(char_length(accepted_address_postal_code)<=64),
 accepted_address_country text check(char_length(accepted_address_country)<=128),
 primary key(event_id,role)
);

create table public.trip_activity_entry_places (
 event_id uuid not null,
 trip_id uuid not null,
 role text not null,
 authored_label text check(char_length(authored_label)<=500),
 authored_text text check(char_length(authored_text)<=5000),
 authored_address text check(char_length(authored_address)<=2000),
 accepted_address text check(char_length(accepted_address)<=2000),
 accepted_latitude double precision check(accepted_latitude between -90 and 90),
 accepted_longitude double precision check(accepted_longitude between -180 and 180),
 accepted_place_id uuid,
 spatial_provenance_refs jsonb check(jsonb_typeof(spatial_provenance_refs)='object' and octet_length(spatial_provenance_refs::text)<=32768),
 location_input_revision bigint check(location_input_revision between 1 and 9007199254740991),
 authored_address_line1 text check(char_length(authored_address_line1)<=500),
 authored_address_line2 text check(char_length(authored_address_line2)<=500),
 authored_address_locality text check(char_length(authored_address_locality)<=200),
 authored_address_region text check(char_length(authored_address_region)<=200),
 authored_address_postal_code text check(char_length(authored_address_postal_code)<=64),
 authored_address_country text check(char_length(authored_address_country)<=128),
 accepted_address_line1 text check(char_length(accepted_address_line1)<=500),
 accepted_address_line2 text check(char_length(accepted_address_line2)<=500),
 accepted_address_locality text check(char_length(accepted_address_locality)<=200),
 accepted_address_region text check(char_length(accepted_address_region)<=200),
 accepted_address_postal_code text check(char_length(accepted_address_postal_code)<=64),
 accepted_address_country text check(char_length(accepted_address_country)<=128),
 primary key(event_id,role)
);

create table public.trip_transport_operational_facts (
 event_id uuid not null,
 trip_id uuid not null,
 role text not null check(role in ('MEETING','CHECKIN','BOARDING_CUTOFF')),
 authored_label text check(char_length(authored_label)<=500),
 authored_text text check(char_length(authored_text)<=5000),
 authored_address text check(char_length(authored_address)<=2000),
 accepted_address text check(char_length(accepted_address)<=2000),
 accepted_latitude double precision check(accepted_latitude between -90 and 90),
 accepted_longitude double precision check(accepted_longitude between -180 and 180),
 accepted_place_id uuid,
 spatial_provenance_refs jsonb check(jsonb_typeof(spatial_provenance_refs)='object' and octet_length(spatial_provenance_refs::text)<=32768),
 location_input_revision bigint check(location_input_revision between 1 and 9007199254740991),
 authored_address_line1 text check(char_length(authored_address_line1)<=500),
 authored_address_line2 text check(char_length(authored_address_line2)<=500),
 authored_address_locality text check(char_length(authored_address_locality)<=200),
 authored_address_region text check(char_length(authored_address_region)<=200),
 authored_address_postal_code text check(char_length(authored_address_postal_code)<=64),
 authored_address_country text check(char_length(authored_address_country)<=128),
 accepted_address_line1 text check(char_length(accepted_address_line1)<=500),
 accepted_address_line2 text check(char_length(accepted_address_line2)<=500),
 accepted_address_locality text check(char_length(accepted_address_locality)<=200),
 accepted_address_region text check(char_length(accepted_address_region)<=200),
 accepted_address_postal_code text check(char_length(accepted_address_postal_code)<=64),
 accepted_address_country text check(char_length(accepted_address_country)<=128),
 local_date date,
 local_time time(6),
 clock_precision smallint check(clock_precision between -1 and 6),
 quality text check(quality in ('UNKNOWN','EXACT','ESTIMATED')),
 basis text check(basis in ('DERIVED_CIVIL','SOURCE_INSTANT')),
 zone_id text check(char_length(zone_id)<=128),
 supplied_offset_seconds integer check(supplied_offset_seconds between -64800 and 64800),
 source_instant timestamptz(6),
 source_instant_precision smallint check(source_instant_precision between -1 and 6),
 civil_resolution text check(civil_resolution in ('PENDING','UNIQUE','GAP','FOLD','FOLD_RESOLVED')),
 resolution_offset_seconds integer check(resolution_offset_seconds between -64800 and 64800),
 interpretation_key text check(char_length(interpretation_key)<=256),
 interpretation_input_sha256 text check(interpretation_input_sha256 ~ '^[0-9a-f]{64}$'),
 provenance_refs jsonb check(jsonb_typeof(provenance_refs)='object' and octet_length(provenance_refs::text)<=32768),
 instant timestamptz(6),
 primary key(event_id,role)
);

alter table public.itinerary_reservations add column revision bigint check(revision between 1 and 9007199254740991);

alter table public.itinerary_reservations add column owner_account_id uuid;

alter table public.itinerary_reservations add column visibility text check(visibility in ('PRIVATE','GROUP','SELECTED_PERSONS'));

alter table public.itinerary_reservations add column hidden_at timestamptz(6);

alter table public.itinerary_reservations add column field_state jsonb check(jsonb_typeof(field_state)='object' and octet_length(field_state::text)<=32768);

alter table public.itinerary_reservations add column business_contract_version smallint check(business_contract_version=2);

alter table public.itinerary_reservations add column contact text check(char_length(contact)<=1000);

alter table public.itinerary_reservations add column booking_url text;

alter table public.itinerary_reservations add column commercial_status text check(commercial_status in ('ACTIVE','CANCELLED','REPLACED'));

alter table public.itinerary_reservations add column replaces_booking_id uuid;

alter table public.itinerary_reservations add column supplier_observation text check(char_length(supplier_observation)<=2000);

alter table public.itinerary_reservations add column price_minor bigint check(price_minor between -9007199254740991 and 9007199254740991);

alter table public.itinerary_reservations add column price_currency text check(price_currency ~ '^[A-Z]{3}$');

alter table public.itinerary_reservations add column price_scale smallint check(price_scale between 0 and 6);

alter table public.itinerary_reservations add column due_minor bigint check(due_minor between -9007199254740991 and 9007199254740991);

alter table public.itinerary_reservations add column due_currency text check(due_currency ~ '^[A-Z]{3}$');

alter table public.itinerary_reservations add column due_scale smallint check(due_scale between 0 and 6);

create table public.trip_booking_observations (
 holder_label text check(char_length(holder_label)<=500),
 observed_start text check(char_length(observed_start)<=500),
 observed_end text check(char_length(observed_end)<=500),
 source_summary text check(char_length(source_summary)<=5000),
 trip_id uuid not null,
 booking_id uuid not null,
 observation_id uuid not null,
 evidence_ref text check(char_length(evidence_ref)<=512),
 primary key(observation_id)
);

create table public.trip_entitlements (
 id uuid not null,
 trip_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 owner_account_id uuid not null,
 visibility text not null check(visibility in ('PRIVATE','GROUP','SELECTED_PERSONS')),
 hidden_at timestamptz(6),
 created_at timestamptz(6) not null,
 updated_at timestamptz(6) not null,
 field_state jsonb not null check(jsonb_typeof(field_state)='object' and octet_length(field_state::text)<=32768),
 kind text not null check(kind in ('TICKET','PASS','BOARDING_PASS','RESERVATION_RIGHT')),
 title text not null check(char_length(title)<=200 and btrim(title)<>''),
 issuer text check(char_length(issuer)<=500),
 reference text check(char_length(reference)<=255),
 quantity integer check(quantity > 0),
 holder_label text check(char_length(holder_label)<=500),
 status text not null check(status in ('ACTIVE','CANCELLED','EXPIRED')),
 access_class text not null check(access_class in ('STATIC_ORIGINAL','CONFIRMATION_ONLY','APPLE_WALLET','EXTERNAL_DYNAMIC','UNKNOWN')),
 provider_url text,
 valid_from_date date,
 valid_until_date date,
 valid_from_instant timestamptz(6),
 valid_until_instant timestamptz(6),
 validity_zone_id text check(char_length(validity_zone_id)<=128),
 validity_precision text check(validity_precision in ('DATE','INSTANT')),
 primary key(id)
);

create table public.trip_operational_documents (
 id uuid not null,
 trip_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 owner_account_id uuid not null,
 visibility text not null check(visibility in ('PRIVATE','GROUP','SELECTED_PERSONS')),
 hidden_at timestamptz(6),
 created_at timestamptz(6) not null,
 updated_at timestamptz(6) not null,
 field_state jsonb not null check(jsonb_typeof(field_state)='object' and octet_length(field_state::text)<=32768),
 title text not null check(char_length(title)<=200 and btrim(title)<>''),
 media_type text not null,
 byte_size integer not null check(byte_size >= 0),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 custody text not null check(custody in ('PRIVATE_SOURCE_REFERENCE','AUTHORIZED_COPY')),
 source_representation_id uuid,
 storage_object_key text check(char_length(storage_object_key)<=1024),
 content_version integer not null check(content_version > 0),
 ticket_face_index integer check(ticket_face_index >= 0),
 qr_region jsonb check(jsonb_typeof(qr_region)='object' and octet_length(qr_region::text)<=32768),
 custody_receipt_id uuid not null,
 primary key(id)
);

create table public.trip_instruction_entries (
 id uuid not null,
 trip_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 owner_account_id uuid not null,
 visibility text not null check(visibility in ('PRIVATE','GROUP','SELECTED_PERSONS')),
 hidden_at timestamptz(6),
 created_at timestamptz(6) not null,
 updated_at timestamptz(6) not null,
 field_state jsonb not null check(jsonb_typeof(field_state)='object' and octet_length(field_state::text)<=32768),
 event_id uuid not null,
 section text not null check(section in ('ARRIVAL','DURING','DEPARTURE','PICKUP','RETURN','TRANSPORT','ENTRY')),
 body text not null check(char_length(body)<=5000),
 sensitivity text not null check(sensitivity in ('NORMAL','SENSITIVE')),
 supersedes_id uuid,
 source_representation_id uuid,
 primary key(id)
);

create table public.trip_booking_item_links (
 trip_id uuid not null,
 booking_id uuid not null,
 item_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 primary key(booking_id,item_id)
);

create table public.trip_entitlement_item_links (
 trip_id uuid not null,
 entitlement_id uuid not null,
 item_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 coach text check(char_length(coach)<=128),
 seat text check(char_length(seat)<=128),
 section text check(char_length(section)<=128),
 cabin text check(char_length(cabin)<=128),
 fare_class text check(char_length(fare_class)<=128),
 baggage_allowance text check(char_length(baggage_allowance)<=500),
 primary key(entitlement_id,item_id)
);

create table public.trip_booking_entitlement_links (
 trip_id uuid not null,
 booking_id uuid not null,
 entitlement_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 primary key(booking_id,entitlement_id)
);

create table public.trip_booking_document_links (
 trip_id uuid not null,
 booking_id uuid not null,
 document_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 primary key(booking_id,document_id)
);

create table public.trip_entitlement_document_links (
 trip_id uuid not null,
 entitlement_id uuid not null,
 document_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 primary key(entitlement_id,document_id)
);

create table public.trip_item_document_links (
 trip_id uuid not null,
 item_id uuid not null,
 document_id uuid not null,
 active boolean not null,
 linked_by uuid not null,
 linked_at timestamptz(6) not null,
 primary key(item_id,document_id)
);

create table public.trip_item_participants (
 trip_id uuid not null,
 item_id uuid not null,
 person_id uuid not null,
 active boolean not null,
 primary key(item_id,person_id)
);

create table public.trip_entitlement_holders (
 trip_id uuid not null,
 entitlement_id uuid not null,
 person_id uuid not null,
 active boolean not null,
 primary key(entitlement_id,person_id)
);

create table public.trip_item_visibility_people (
 trip_id uuid not null,
 item_id uuid not null,
 person_id uuid not null,
 primary key(item_id,person_id)
);

create table public.trip_booking_visibility_people (
 trip_id uuid not null,
 booking_id uuid not null,
 person_id uuid not null,
 primary key(booking_id,person_id)
);

create table public.trip_entitlement_visibility_people (
 trip_id uuid not null,
 entitlement_id uuid not null,
 person_id uuid not null,
 primary key(entitlement_id,person_id)
);

create table public.trip_document_visibility_people (
 trip_id uuid not null,
 document_id uuid not null,
 person_id uuid not null,
 primary key(document_id,person_id)
);

create table public.trip_instruction_visibility_people (
 trip_id uuid not null,
 instruction_id uuid not null,
 person_id uuid not null,
 primary key(instruction_id,person_id)
);

alter table public.itinerary_events add constraint core_v2_itinerary_events_trip_key unique(trip_id,id);

alter table public.itinerary_transport_endpoints add constraint core_v2_itinerary_transport_endpoints_trip_key unique(trip_id,event_id,role);

alter table public.trip_endpoint_details add constraint core_v2_trip_endpoint_details_trip_key unique(trip_id,event_id,role);

alter table public.trip_flight_intents add constraint core_v2_trip_flight_intents_trip_key unique(trip_id,event_id);

alter table public.itinerary_transport_services add constraint core_v2_itinerary_transport_services_trip_key unique(trip_id,event_id,service_key);

alter table public.trip_stay_details add constraint core_v2_trip_stay_details_trip_key unique(trip_id,event_id);

alter table public.trip_stay_rooms add constraint core_v2_trip_stay_rooms_trip_key unique(trip_id,event_id,room_id);

alter table public.trip_rental_details add constraint core_v2_trip_rental_details_trip_key unique(trip_id,event_id);

alter table public.trip_activity_details add constraint core_v2_trip_activity_details_trip_key unique(trip_id,event_id);

alter table public.trip_rental_places add constraint core_v2_trip_rental_places_trip_key unique(trip_id,event_id,role);

alter table public.trip_activity_entry_places add constraint core_v2_trip_activity_entry_places_trip_key unique(trip_id,event_id,role);

alter table public.trip_transport_operational_facts add constraint core_v2_trip_transport_operational_facts_trip_key unique(trip_id,event_id,role);

alter table public.itinerary_reservations add constraint core_v2_itinerary_reservations_trip_key unique(trip_id,id);

alter table public.trip_booking_observations add constraint core_v2_trip_booking_observations_trip_key unique(trip_id,observation_id);

alter table public.trip_entitlements add constraint core_v2_trip_entitlements_trip_key unique(trip_id,id);

alter table public.trip_operational_documents add constraint core_v2_trip_operational_documents_trip_key unique(trip_id,id);

alter table public.trip_instruction_entries add constraint core_v2_trip_instruction_entries_trip_key unique(trip_id,id);

alter table public.trip_booking_item_links add constraint core_v2_trip_booking_item_links_trip_key unique(trip_id,booking_id,item_id);

alter table public.trip_entitlement_item_links add constraint core_v2_trip_entitlement_item_links_trip_key unique(trip_id,entitlement_id,item_id);

alter table public.trip_booking_entitlement_links add constraint core_v2_trip_booking_entitlement_links_trip_key unique(trip_id,booking_id,entitlement_id);

alter table public.trip_booking_document_links add constraint core_v2_trip_booking_document_links_trip_key unique(trip_id,booking_id,document_id);

alter table public.trip_entitlement_document_links add constraint core_v2_trip_entitlement_document_links_trip_key unique(trip_id,entitlement_id,document_id);

alter table public.trip_item_document_links add constraint core_v2_trip_item_document_links_trip_key unique(trip_id,item_id,document_id);

alter table public.trip_item_participants add constraint core_v2_trip_item_participants_trip_key unique(trip_id,item_id,person_id);

alter table public.trip_entitlement_holders add constraint core_v2_trip_entitlement_holders_trip_key unique(trip_id,entitlement_id,person_id);

alter table public.trip_item_visibility_people add constraint core_v2_trip_item_visibility_people_trip_key unique(trip_id,item_id,person_id);

alter table public.trip_booking_visibility_people add constraint core_v2_trip_booking_visibility_people_trip_key unique(trip_id,booking_id,person_id);

alter table public.trip_entitlement_visibility_people add constraint core_v2_trip_entitlement_visibility_people_trip_key unique(trip_id,entitlement_id,person_id);

alter table public.trip_document_visibility_people add constraint core_v2_trip_document_visibility_people_trip_key unique(trip_id,document_id,person_id);

alter table public.trip_instruction_visibility_people add constraint core_v2_trip_instruction_visibility_people_trip_key unique(trip_id,instruction_id,person_id);

alter table public.journey_members add constraint core_v2_person_trip_key unique(trip_id,id);

alter table public.itinerary_transport_endpoints add constraint core_v2_itinerary_transport_endpoints_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_endpoint_details add constraint core_v2_trip_endpoint_details_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_endpoint_details add constraint core_v2_trip_endpoint_details_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_flight_intents add constraint core_v2_trip_flight_intents_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_flight_intents add constraint core_v2_trip_flight_intents_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.itinerary_transport_services add constraint core_v2_itinerary_transport_services_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_stay_details add constraint core_v2_trip_stay_details_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_stay_details add constraint core_v2_trip_stay_details_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_stay_rooms add constraint core_v2_trip_stay_rooms_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_stay_rooms add constraint core_v2_trip_stay_rooms_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_rental_details add constraint core_v2_trip_rental_details_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_rental_details add constraint core_v2_trip_rental_details_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_activity_details add constraint core_v2_trip_activity_details_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_activity_details add constraint core_v2_trip_activity_details_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_rental_places add constraint core_v2_trip_rental_places_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_rental_places add constraint core_v2_trip_rental_places_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_activity_entry_places add constraint core_v2_trip_activity_entry_places_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_activity_entry_places add constraint core_v2_trip_activity_entry_places_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_transport_operational_facts add constraint core_v2_trip_transport_operational_facts_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_transport_operational_facts add constraint core_v2_trip_transport_operational_facts_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_booking_observations add constraint core_v2_trip_booking_observations_booking_id foreign key(trip_id,booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_observations add constraint core_v2_trip_booking_observations_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_entitlements add constraint core_v2_trip_entitlements_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_operational_documents add constraint core_v2_trip_operational_documents_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_instruction_entries add constraint core_v2_trip_instruction_entries_event_id foreign key(trip_id,event_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_instruction_entries add constraint core_v2_trip_instruction_entries_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_booking_item_links add constraint core_v2_trip_booking_item_links_item_id foreign key(trip_id,item_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_item_links add constraint core_v2_trip_booking_item_links_booking_id foreign key(trip_id,booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_item_links add constraint core_v2_trip_booking_item_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_entitlement_item_links add constraint core_v2_trip_entitlement_item_links_item_id foreign key(trip_id,item_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_item_links add constraint core_v2_trip_entitlement_item_links_entitlement_id foreign key(trip_id,entitlement_id) references public.trip_entitlements(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_item_links add constraint core_v2_trip_entitlement_item_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_booking_entitlement_links add constraint core_v2_trip_booking_entitlement_links_booking_id foreign key(trip_id,booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_entitlement_links add constraint core_v2_trip_booking_entitlement_links_entitlement_id foreign key(trip_id,entitlement_id) references public.trip_entitlements(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_entitlement_links add constraint core_v2_trip_booking_entitlement_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_booking_document_links add constraint core_v2_trip_booking_document_links_booking_id foreign key(trip_id,booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_document_links add constraint core_v2_trip_booking_document_links_document_id foreign key(trip_id,document_id) references public.trip_operational_documents(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_document_links add constraint core_v2_trip_booking_document_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_entitlement_document_links add constraint core_v2_trip_entitlement_document_links_entitlement_id foreign key(trip_id,entitlement_id) references public.trip_entitlements(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_document_links add constraint core_v2_trip_entitlement_document_links_document_id foreign key(trip_id,document_id) references public.trip_operational_documents(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_document_links add constraint core_v2_trip_entitlement_document_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_item_document_links add constraint core_v2_trip_item_document_links_item_id foreign key(trip_id,item_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_item_document_links add constraint core_v2_trip_item_document_links_document_id foreign key(trip_id,document_id) references public.trip_operational_documents(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_item_document_links add constraint core_v2_trip_item_document_links_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_item_participants add constraint core_v2_trip_item_participants_item_id foreign key(trip_id,item_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_item_participants add constraint core_v2_trip_item_participants_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_item_participants add constraint core_v2_trip_item_participants_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_holders add constraint core_v2_trip_entitlement_holders_entitlement_id foreign key(trip_id,entitlement_id) references public.trip_entitlements(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_holders add constraint core_v2_trip_entitlement_holders_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_entitlement_holders add constraint core_v2_trip_entitlement_holders_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_item_visibility_people add constraint core_v2_trip_item_visibility_people_item_id foreign key(trip_id,item_id) references public.itinerary_events(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_item_visibility_people add constraint core_v2_trip_item_visibility_people_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_item_visibility_people add constraint core_v2_trip_item_visibility_people_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_visibility_people add constraint core_v2_trip_booking_visibility_people_booking_id foreign key(trip_id,booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_booking_visibility_people add constraint core_v2_trip_booking_visibility_people_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_booking_visibility_people add constraint core_v2_trip_booking_visibility_people_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_visibility_people add constraint core_v2_trip_entitlement_visibility_people_entitlement_id foreign key(trip_id,entitlement_id) references public.trip_entitlements(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_entitlement_visibility_people add constraint core_v2_trip_entitlement_visibility_people_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_entitlement_visibility_people add constraint core_v2_trip_entitlement_visibility_people_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_document_visibility_people add constraint core_v2_trip_document_visibility_people_document_id foreign key(trip_id,document_id) references public.trip_operational_documents(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_document_visibility_people add constraint core_v2_trip_document_visibility_people_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_document_visibility_people add constraint core_v2_trip_document_visibility_people_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_instruction_visibility_people add constraint core_v2_trip_instruction_visibility_people_instruction_id foreign key(trip_id,instruction_id) references public.trip_instruction_entries(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_instruction_visibility_people add constraint core_v2_trip_instruction_visibility_people_trip foreign key(trip_id) references public.trips(id) on delete restrict;

alter table public.trip_instruction_visibility_people add constraint core_v2_trip_instruction_visibility_people_person foreign key(trip_id,person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.trip_instruction_entries add constraint core_v2_instruction_successor unique(supersedes_id);

alter table public.trip_instruction_entries add constraint core_v2_instruction_predecessor foreign key(trip_id,supersedes_id) references public.trip_instruction_entries(trip_id,id) on delete restrict deferrable initially deferred;

alter table public.itinerary_reservations add constraint core_v2_booking_replacement unique(replaces_booking_id);

alter table public.itinerary_reservations add constraint core_v2_booking_predecessor foreign key(trip_id,replaces_booking_id) references public.itinerary_reservations(trip_id,id) on delete restrict deferrable initially deferred;

-- Dedicated dormant principals. Authentication/public REST cannot acquire these roles.
do $$ declare principal text; begin
 foreach principal in array array['otr_trip_core_v2_gateway','otr_trip_core_v2_writer'] loop
  if not exists(select 1 from pg_roles where rolname=principal) then
   execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',principal);
  end if;
  if exists(select 1 from pg_roles where rolname=principal and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication)) or
   exists(select 1 from pg_auth_members where roleid=principal::regrole or member=principal::regrole) then raise exception 'UNSAFE_CORE_V2_PRINCIPAL';end if;
 end loop;
end $$;
grant otr_trip_core_v2_writer to otr_trip_core_v2_gateway with inherit false,set true;
grant usage on schema public,auth,extensions to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

create table public.trip_core_activation_gate (
 singleton boolean primary key default true check(singleton),
 runtime_enabled boolean not null default false check(not runtime_enabled),
 command_version smallint not null default 2 check(command_version=2),
 read_version smallint not null default 2 check(read_version=2),
 capture_version smallint not null default 2 check(capture_version=2),
 enabled_commands text[] not null default '{}' check(enabled_commands='{}'),
 enabled_families text[] not null default '{}' check(enabled_families='{}'),
 enabled_admission_modes text[] not null default '{}' check(enabled_admission_modes='{}')
);
insert into public.trip_core_activation_gate(singleton) values(true);
revoke all on public.trip_core_activation_gate from public,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
grant select on public.trip_core_activation_gate to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

create table public.trip_core_command_receipts (
 id uuid primary key,
 actor_account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 operation_id uuid not null,
 command_version smallint not null check(command_version=2),
 intent_version smallint not null check(intent_version=2),
 receipt_version smallint not null check(receipt_version=2),
 canonical_intent_text text not null check(octet_length(canonical_intent_text)<=32768),
 intent_sha256 text not null check(intent_sha256 ~ '^[0-9a-f]{64}$'),
 receipt_sha256 text not null check(receipt_sha256 ~ '^[0-9a-f]{64}$'),
 outcome text not null check(outcome in ('APPLIED','NO_CHANGE','CONFLICT','REJECTED')),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=1048576),
 committed_at timestamptz(6) not null check(isfinite(committed_at)),
 unique(actor_account_id,operation_id)
);
create table public.trip_core_read_state (
 trip_id uuid primary key references public.trips(id) on delete restrict,
 epoch uuid not null default gen_random_uuid(),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 access_revision bigint not null default 1 check(access_revision between 1 and 9007199254740991)
);

create table public.trip_source_core_v2_candidates (
 candidate_id uuid primary key,
 account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 source_revision bigint not null,
 run_id uuid not null references public.trip_source_runs(id) on delete restrict,
 input_catalog_sha256 text not null check(input_catalog_sha256 ~ '^[0-9a-f]{64}$'),
 candidate_sha256 text not null check(candidate_sha256 ~ '^[0-9a-f]{64}$'),
 candidate_json jsonb not null check(jsonb_typeof(candidate_json)='object' and octet_length(candidate_json::text)<=65536),
 sealed_at timestamptz(6) not null check(isfinite(sealed_at)),
 foreign key(source_id,source_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 unique(trip_id,account_id,source_id,candidate_id)
);
create table public.trip_source_core_v2_intents (
 plan_id uuid primary key,
 account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 source_revision bigint not null,
 proposal_version smallint not null check(proposal_version=2),
 intent_version smallint not null check(intent_version=2),
 request_sha256 text not null check(request_sha256 ~ '^[0-9a-f]{64}$'),
 request_json jsonb not null check(jsonb_typeof(request_json)='object' and octet_length(request_json::text)<=2097152),
 prepared_json jsonb not null check(jsonb_typeof(prepared_json)='object' and octet_length(prepared_json::text)<=8388608),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 foreign key(source_id,source_revision) references public.trip_source_revisions(source_id,material_revision) on delete restrict,
 unique(trip_id,account_id,plan_id)
);
create table public.trip_source_core_v2_slots (
 output_slot_id uuid primary key,
 plan_id uuid not null references public.trip_source_core_v2_intents(plan_id) on delete restrict,
 account_id uuid not null references auth.users(id) on delete restrict,
 trip_id uuid not null references public.trips(id) on delete restrict,
 candidate_id uuid not null references public.trip_source_core_v2_candidates(candidate_id) on delete restrict,
 slot_key text not null check(slot_key ~ '^[A-Za-z0-9._:-]{1,32}$'),
 target_kind text not null check(target_kind in ('ITEM','BOOKING','ENTITLEMENT','DOCUMENT','INSTRUCTION','RELATION')),
 target_id uuid not null,
 operation_id uuid not null,
 command text not null,
 canonical_intent_text text check(octet_length(canonical_intent_text)<=32768),
 intent_sha256 text check(intent_sha256 ~ '^[0-9a-f]{64}$'),
 target_vector jsonb not null check(jsonb_typeof(target_vector)='array'),
 dependency_ids uuid[] not null default '{}',
 source_id uuid not null references public.trip_sources(id) on delete restrict,
 output_purpose jsonb not null check(jsonb_typeof(output_purpose)='object'),
 purpose_sha256 text not null check(purpose_sha256 ~ '^[0-9a-f]{64}$'),
 identity_sha256 text not null check(identity_sha256 ~ '^[0-9a-f]{64}$'),
 state text not null check(state in ('READY','BLOCKED','DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE','REVIEW')),
 domain_receipt_id uuid references public.trip_core_command_receipts(id) on delete restrict,
 source_lineage_id uuid,
 unique(account_id,operation_id),unique(candidate_id,slot_key,target_kind),
 foreign key(trip_id,account_id,plan_id) references public.trip_source_core_v2_intents(trip_id,account_id,plan_id) on delete restrict,
 foreign key(trip_id,account_id,source_id,candidate_id) references public.trip_source_core_v2_candidates(trip_id,account_id,source_id,candidate_id) on delete restrict,
 check((intent_sha256 is null)=(canonical_intent_text is null)),
 check(state<>'READY' or intent_sha256 is not null),
 check(state not in ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE') or domain_receipt_id is not null)
);
create unique index trip_core_active_purpose_claim on public.trip_source_core_v2_slots(account_id,trip_id,source_id,purpose_sha256) where command in ('CREATE_ITEM','CREATE_SPARSE_FLIGHT') and state<>'REVIEW';
create unique index trip_core_active_identity_claim on public.trip_source_core_v2_slots(account_id,trip_id,source_id,identity_sha256) where command in ('CREATE_ITEM','CREATE_SPARSE_FLIGHT') and state<>'REVIEW';

create function public.trip_core_actor_has_trip(actor uuid,trip uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select actor is not null and (exists(select 1 from public.trips where id=trip and created_by=actor) or exists(select 1 from public.trip_members where trip_id=trip and user_id=actor) or exists(select 1 from public.journey_members where trip_id=trip and user_id=actor and status='linked')) $$;
revoke all on function public.trip_core_actor_has_trip(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_actor_has_trip(uuid,uuid) to otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

create function public.trip_core_authenticated_root_access(kind text, object_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$ declare actor uuid:=auth.uid();r record;person uuid; begin
 if actor is null then return false;end if;
 select id into person from public.journey_members where user_id=actor and status='linked' and trip_id=(case kind when 'ITEM' then (select trip_id from public.itinerary_events where id=object_id) when 'BOOKING' then (select trip_id from public.itinerary_reservations where id=object_id) when 'ENTITLEMENT' then (select trip_id from public.trip_entitlements where id=object_id) when 'DOCUMENT' then (select trip_id from public.trip_operational_documents where id=object_id) when 'INSTRUCTION' then (select trip_id from public.trip_instruction_entries where id=object_id) end);
 if kind='ITEM' then
  select trip_id,owner_account_id,visibility into r from public.itinerary_events where id=object_id;
  return found and public.trip_core_actor_has_trip(actor,r.trip_id) and (r.owner_account_id=actor or r.visibility='GROUP' or r.visibility='SELECTED_PERSONS' and exists(select 1 from public.trip_item_visibility_people where item_id=object_id and person_id=person));
 elsif kind='BOOKING' then
  select trip_id,owner_account_id,visibility into r from public.itinerary_reservations where id=object_id;
  return found and public.trip_core_actor_has_trip(actor,r.trip_id) and (r.owner_account_id=actor or r.visibility='GROUP' or r.visibility='SELECTED_PERSONS' and exists(select 1 from public.trip_booking_visibility_people where booking_id=object_id and person_id=person));
 elsif kind='ENTITLEMENT' then
  select trip_id,owner_account_id,visibility into r from public.trip_entitlements where id=object_id;
  return found and public.trip_core_actor_has_trip(actor,r.trip_id) and (r.owner_account_id=actor or r.visibility='GROUP' or r.visibility='SELECTED_PERSONS' and exists(select 1 from public.trip_entitlement_visibility_people where entitlement_id=object_id and person_id=person));
 elsif kind='DOCUMENT' then
  select trip_id,owner_account_id,visibility,custody,source_representation_id into r from public.trip_operational_documents where id=object_id;
  return found and public.trip_core_actor_has_trip(actor,r.trip_id) and (r.owner_account_id=actor or r.visibility='GROUP' or r.visibility='SELECTED_PERSONS' and exists(select 1 from public.trip_document_visibility_people where document_id=object_id and person_id=person)) and (r.custody='AUTHORIZED_COPY' or exists(select 1 from public.trip_source_representations rep join public.trip_sources src on src.id=rep.source_id where rep.id=r.source_representation_id and src.acquired_by=actor and src.lifecycle='ACTIVE'));
 elsif kind='INSTRUCTION' then
  select trip_id,owner_account_id,visibility,event_id into r from public.trip_instruction_entries where id=object_id;
  return found and public.trip_core_authenticated_root_access('ITEM',r.event_id) and public.trip_core_actor_has_trip(actor,r.trip_id) and (r.owner_account_id=actor or r.visibility='GROUP' or r.visibility='SELECTED_PERSONS' and exists(select 1 from public.trip_instruction_visibility_people where instruction_id=object_id and person_id=person));
 end if;
 return false;
end $$;
revoke all on function public.trip_core_authenticated_root_access(text,uuid) from public,anon,service_role;
grant execute on function public.trip_core_authenticated_root_access(text,uuid) to authenticated;

-- Independent v2 privacy limits legacy permissive Item/Reservation policies.
create policy core_v2_item_privacy on public.itinerary_events as restrictive for select to authenticated
 using (business_contract_version is null or public.trip_core_authenticated_root_access('ITEM',id));
create policy core_v2_booking_privacy on public.itinerary_reservations as restrictive for select to authenticated
 using (business_contract_version is null or public.trip_core_authenticated_root_access('BOOKING',id));

create function public.trip_core_boundary_valid(row_data jsonb,prefix text)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare d date; t time; p integer; q text; b text; n timestamptz; s timestamptz; sp integer;r text;off integer;z text;ik text;ih text;begin
 d:=(row_data->>(prefix||'local_date'))::date;t:=(row_data->>(prefix||'local_time'))::time;p:=(row_data->>(prefix||'clock_precision'))::integer;
 q:=row_data->>(prefix||'quality');b:=row_data->>(prefix||'basis');s:=(row_data->>(prefix||'source_instant'))::timestamptz;sp:=(row_data->>(prefix||'source_instant_precision'))::integer;
 r:=row_data->>(prefix||'civil_resolution');off:=(row_data->>(prefix||'resolution_offset_seconds'))::integer;z:=row_data->>(prefix||'zone_id');ik:=row_data->>(prefix||'interpretation_key');ih:=row_data->>(prefix||'interpretation_input_sha256');
 n:=(row_data->>case prefix when 'start_' then 'planned_start' when 'end_' then 'planned_end' else 'instant' end)::timestamptz;
 if d is not null and (not isfinite(d) or extract(year from d) not between 1 and 9999) or t is not null and t>=time '24:00' or n is not null and not isfinite(n) then return false;end if;
 if (t is null)<>(p is null) or p is not null and (p not between -1 and 6 or p=-1 and extract(second from t)<>0 or p>=0 and extract(epoch from t)<>trunc(extract(epoch from t),p)) then return false;end if;
 if (s is null)<>(sp is null) or sp is not null and (sp not between -1 and 6 or sp=-1 and extract(second from s at time zone 'UTC')<>0 or sp>=0 and extract(epoch from s)<>trunc(extract(epoch from s),sp)) then return false;end if;
 if n is not null then
  if q<>'EXACT' or q is null then return false;end if;
  if b='SOURCE_INSTANT' then return s is not null and n=s;end if;
  return b='DERIVED_CIVIL' and d is not null and t is not null and z is not null and r in ('UNIQUE','FOLD_RESOLVED') and off is not null and ik is not null and ih ~ '^[0-9a-f]{64}$' and n=((d+t) at time zone 'UTC')-make_interval(secs=>off);
 end if;
 if s is not null or b='SOURCE_INSTANT' or off is not null or ik is not null or ih is not null or r is not null and r<>'PENDING' then return false;end if;
 if t is null then return (q='UNKNOWN' or q is null) and (b='DERIVED_CIVIL' or b is null);end if;
 return q='ESTIMATED' and b='DERIVED_CIVIL' and r='PENDING';
exception when others then return false;end $$;
revoke all on function public.trip_core_boundary_valid(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_boundary_valid(jsonb,text) to otr_trip_core_v2_writer;

create function public.trip_core_event_row_valid(r jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $$ declare family text:=r->>'experience_family';shape text:=r->>'temporal_shape';begin
 if r->>'business_contract_version'<>'2' or r->>'temporal_contract_version'<>'1' or r->>'owner_account_id' is null or r->>'visibility' not in ('PRIVATE','GROUP','SELECTED_PERSONS') or r->>'participation_mode' not in ('WHOLE_GROUP','SELECTED_MEMBERS','SELF') or r->>'participant_scope'<>(case when r->>'participation_mode'='WHOLE_GROUP' then 'WHOLE_GROUP' else 'ASSIGNED' end) or jsonb_typeof(r->'field_state')<>'object' or r->>'semantic_revision' is null then return false;end if;
 if family not in ('P1','P2','P3','P4','P5','P6') or shape not in ('POINT','CALENDAR','ALL_DAY','SPAN','STAY','TRANSPORT','WINDOW') then return false;end if;
 if family='P3' and (shape<>'STAY' or r->>'end_local_date' is null) or family='P5' and shape<>'TRANSPORT' or family='P2' and shape not in ('CALENDAR','TRANSPORT') or family in ('P1','P4','P6') and shape in ('STAY','TRANSPORT') then return false;end if;
 if shape='TRANSPORT' then return r->>'start_local_date' is null and r->>'end_local_date' is null and r->>'planned_start' is null and r->>'planned_end' is null;end if;
 return r->>'start_local_date' is not null and public.trip_core_boundary_valid(r,'start_') and public.trip_core_boundary_valid(r,'end_') and (r->>'end_local_date' is null or (r->>'end_local_date')::date >=(r->>'start_local_date')::date) and (r->>'planned_start' is null or r->>'planned_end' is null or (r->>'planned_end')::timestamptz >= (r->>'planned_start')::timestamptz);
exception when others then return false;end $$;
revoke all on function public.trip_core_event_row_valid(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_event_row_valid(jsonb) to otr_trip_core_v2_writer;

create function public.trip_core_guard_write()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if tg_table_name in ('itinerary_events','itinerary_reservations') and coalesce(old_json->>'business_contract_version',new_json->>'business_contract_version') is null then return coalesce(new,old);end if;
 if tg_table_name in ('itinerary_transport_endpoints','itinerary_transport_services') and coalesce(old_json->>'trip_id',new_json->>'trip_id') is null then return coalesce(new,old);end if;
 if current_user<>'otr_trip_core_v2_writer' or not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
 if not public.trip_core_actor_has_trip(actor,trip) then raise exception 'CORE_V2_NOT_VISIBLE' using errcode='42501';end if;
 if tg_op='DELETE' and tg_table_name in ('itinerary_events','itinerary_reservations','trip_entitlements','trip_operational_documents','trip_instruction_entries','trip_booking_observations','trip_core_command_receipts','trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots') then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='UPDATE' and (old_json->'id' is distinct from new_json->'id' or old_json->'trip_id' is distinct from new_json->'trip_id' or old_json->'owner_account_id' is distinct from new_json->'owner_account_id' or old_json->'created_at' is distinct from new_json->'created_at') then raise exception 'CORE_V2_IMMUTABLE_IDENTITY' using errcode='23514';end if;
 if tg_table_name='trip_core_command_receipts' and tg_op<>'INSERT' then raise exception 'CORE_V2_RECEIPT_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_candidates' and tg_op<>'INSERT' then raise exception 'CORE_V2_CANDIDATE_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_instruction_entries' and tg_op='UPDATE' and (old_json-array['revision','visibility','hidden_at','updated_at','field_state']) is distinct from (new_json-array['revision','visibility','hidden_at','updated_at','field_state']) then raise exception 'CORE_V2_INSTRUCTION_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='itinerary_events' and tg_op<>'DELETE' and not public.trip_core_event_row_valid(new_json) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 return coalesce(new,old);
end $$;
revoke all on function public.trip_core_guard_write() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_guard_write() to otr_trip_core_v2_writer;
grant select on public.itinerary_events to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.itinerary_events to otr_trip_core_v2_writer;
create policy core_v2_writer on public.itinerary_events to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.itinerary_events for each row execute function public.trip_core_guard_write();
alter table public.itinerary_events add constraint core_v2_owner foreign key(owner_account_id) references auth.users(id) on delete restrict;
grant select on public.itinerary_transport_endpoints to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.itinerary_transport_endpoints to otr_trip_core_v2_writer;
create policy core_v2_writer on public.itinerary_transport_endpoints to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.itinerary_transport_endpoints for each row execute function public.trip_core_guard_write();

alter table public.trip_endpoint_details enable row level security;
revoke all on public.trip_endpoint_details from public,anon,authenticated,service_role;
grant select on public.trip_endpoint_details to authenticated;
create policy core_v2_actor_read on public.trip_endpoint_details for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_endpoint_details to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_endpoint_details to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_endpoint_details to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_endpoint_details for each row execute function public.trip_core_guard_write();

alter table public.trip_flight_intents enable row level security;
revoke all on public.trip_flight_intents from public,anon,authenticated,service_role;
grant select on public.trip_flight_intents to authenticated;
create policy core_v2_actor_read on public.trip_flight_intents for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_flight_intents to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_flight_intents to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_flight_intents to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_flight_intents for each row execute function public.trip_core_guard_write();
grant select on public.itinerary_transport_services to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.itinerary_transport_services to otr_trip_core_v2_writer;
create policy core_v2_writer on public.itinerary_transport_services to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.itinerary_transport_services for each row execute function public.trip_core_guard_write();

alter table public.trip_stay_details enable row level security;
revoke all on public.trip_stay_details from public,anon,authenticated,service_role;
grant select on public.trip_stay_details to authenticated;
create policy core_v2_actor_read on public.trip_stay_details for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_stay_details to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_stay_details to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_stay_details to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_stay_details for each row execute function public.trip_core_guard_write();

alter table public.trip_stay_rooms enable row level security;
revoke all on public.trip_stay_rooms from public,anon,authenticated,service_role;
grant select on public.trip_stay_rooms to authenticated;
create policy core_v2_actor_read on public.trip_stay_rooms for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_stay_rooms to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_stay_rooms to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_stay_rooms to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_stay_rooms for each row execute function public.trip_core_guard_write();

alter table public.trip_rental_details enable row level security;
revoke all on public.trip_rental_details from public,anon,authenticated,service_role;
grant select on public.trip_rental_details to authenticated;
create policy core_v2_actor_read on public.trip_rental_details for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_rental_details to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_rental_details to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_rental_details to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_rental_details for each row execute function public.trip_core_guard_write();

alter table public.trip_activity_details enable row level security;
revoke all on public.trip_activity_details from public,anon,authenticated,service_role;
grant select on public.trip_activity_details to authenticated;
create policy core_v2_actor_read on public.trip_activity_details for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_activity_details to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_activity_details to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_activity_details to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_activity_details for each row execute function public.trip_core_guard_write();

alter table public.trip_rental_places enable row level security;
revoke all on public.trip_rental_places from public,anon,authenticated,service_role;
grant select on public.trip_rental_places to authenticated;
create policy core_v2_actor_read on public.trip_rental_places for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_rental_places to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_rental_places to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_rental_places to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_rental_places for each row execute function public.trip_core_guard_write();

alter table public.trip_activity_entry_places enable row level security;
revoke all on public.trip_activity_entry_places from public,anon,authenticated,service_role;
grant select on public.trip_activity_entry_places to authenticated;
create policy core_v2_actor_read on public.trip_activity_entry_places for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_activity_entry_places to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_activity_entry_places to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_activity_entry_places to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_activity_entry_places for each row execute function public.trip_core_guard_write();

alter table public.trip_transport_operational_facts enable row level security;
revoke all on public.trip_transport_operational_facts from public,anon,authenticated,service_role;
grant select on public.trip_transport_operational_facts to authenticated;
create policy core_v2_actor_read on public.trip_transport_operational_facts for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',event_id));
grant select on public.trip_transport_operational_facts to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_transport_operational_facts to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_transport_operational_facts to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_transport_operational_facts for each row execute function public.trip_core_guard_write();
grant select on public.itinerary_reservations to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.itinerary_reservations to otr_trip_core_v2_writer;
create policy core_v2_writer on public.itinerary_reservations to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.itinerary_reservations for each row execute function public.trip_core_guard_write();
alter table public.itinerary_reservations add constraint core_v2_owner foreign key(owner_account_id) references auth.users(id) on delete restrict;

alter table public.trip_booking_observations enable row level security;
revoke all on public.trip_booking_observations from public,anon,authenticated,service_role;
grant select on public.trip_booking_observations to authenticated;
create policy core_v2_actor_read on public.trip_booking_observations for select to authenticated using (public.trip_core_authenticated_root_access('BOOKING',booking_id));
grant select on public.trip_booking_observations to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_booking_observations to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_booking_observations to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_booking_observations for each row execute function public.trip_core_guard_write();

alter table public.trip_entitlements enable row level security;
revoke all on public.trip_entitlements from public,anon,authenticated,service_role;
grant select on public.trip_entitlements to authenticated;
create policy core_v2_actor_read on public.trip_entitlements for select to authenticated using (public.trip_core_authenticated_root_access('ENTITLEMENT',id));
grant select on public.trip_entitlements to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_entitlements to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_entitlements to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_entitlements for each row execute function public.trip_core_guard_write();
alter table public.trip_entitlements add constraint core_v2_owner foreign key(owner_account_id) references auth.users(id) on delete restrict;

alter table public.trip_operational_documents enable row level security;
revoke all on public.trip_operational_documents from public,anon,authenticated,service_role;
grant select on public.trip_operational_documents to authenticated;
create policy core_v2_actor_read on public.trip_operational_documents for select to authenticated using (public.trip_core_authenticated_root_access('DOCUMENT',id));
grant select on public.trip_operational_documents to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_operational_documents to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_operational_documents to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_operational_documents for each row execute function public.trip_core_guard_write();
alter table public.trip_operational_documents add constraint core_v2_owner foreign key(owner_account_id) references auth.users(id) on delete restrict;

alter table public.trip_instruction_entries enable row level security;
revoke all on public.trip_instruction_entries from public,anon,authenticated,service_role;
grant select on public.trip_instruction_entries to authenticated;
create policy core_v2_actor_read on public.trip_instruction_entries for select to authenticated using (public.trip_core_authenticated_root_access('INSTRUCTION',id));
grant select on public.trip_instruction_entries to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_instruction_entries to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_instruction_entries to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_instruction_entries for each row execute function public.trip_core_guard_write();
alter table public.trip_instruction_entries add constraint core_v2_owner foreign key(owner_account_id) references auth.users(id) on delete restrict;

alter table public.trip_booking_item_links enable row level security;
revoke all on public.trip_booking_item_links from public,anon,authenticated,service_role;
grant select on public.trip_booking_item_links to authenticated;
create policy core_v2_actor_read on public.trip_booking_item_links for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',item_id) and public.trip_core_authenticated_root_access('BOOKING',booking_id));
grant select on public.trip_booking_item_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_booking_item_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_booking_item_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_booking_item_links for each row execute function public.trip_core_guard_write();

alter table public.trip_entitlement_item_links enable row level security;
revoke all on public.trip_entitlement_item_links from public,anon,authenticated,service_role;
grant select on public.trip_entitlement_item_links to authenticated;
create policy core_v2_actor_read on public.trip_entitlement_item_links for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',item_id) and public.trip_core_authenticated_root_access('ENTITLEMENT',entitlement_id));
grant select on public.trip_entitlement_item_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_entitlement_item_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_entitlement_item_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_entitlement_item_links for each row execute function public.trip_core_guard_write();

alter table public.trip_booking_entitlement_links enable row level security;
revoke all on public.trip_booking_entitlement_links from public,anon,authenticated,service_role;
grant select on public.trip_booking_entitlement_links to authenticated;
create policy core_v2_actor_read on public.trip_booking_entitlement_links for select to authenticated using (public.trip_core_authenticated_root_access('BOOKING',booking_id) and public.trip_core_authenticated_root_access('ENTITLEMENT',entitlement_id));
grant select on public.trip_booking_entitlement_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_booking_entitlement_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_booking_entitlement_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_booking_entitlement_links for each row execute function public.trip_core_guard_write();

alter table public.trip_booking_document_links enable row level security;
revoke all on public.trip_booking_document_links from public,anon,authenticated,service_role;
grant select on public.trip_booking_document_links to authenticated;
create policy core_v2_actor_read on public.trip_booking_document_links for select to authenticated using (public.trip_core_authenticated_root_access('BOOKING',booking_id) and public.trip_core_authenticated_root_access('DOCUMENT',document_id));
grant select on public.trip_booking_document_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_booking_document_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_booking_document_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_booking_document_links for each row execute function public.trip_core_guard_write();

alter table public.trip_entitlement_document_links enable row level security;
revoke all on public.trip_entitlement_document_links from public,anon,authenticated,service_role;
grant select on public.trip_entitlement_document_links to authenticated;
create policy core_v2_actor_read on public.trip_entitlement_document_links for select to authenticated using (public.trip_core_authenticated_root_access('ENTITLEMENT',entitlement_id) and public.trip_core_authenticated_root_access('DOCUMENT',document_id));
grant select on public.trip_entitlement_document_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_entitlement_document_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_entitlement_document_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_entitlement_document_links for each row execute function public.trip_core_guard_write();

alter table public.trip_item_document_links enable row level security;
revoke all on public.trip_item_document_links from public,anon,authenticated,service_role;
grant select on public.trip_item_document_links to authenticated;
create policy core_v2_actor_read on public.trip_item_document_links for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',item_id) and public.trip_core_authenticated_root_access('DOCUMENT',document_id));
grant select on public.trip_item_document_links to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_item_document_links to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_item_document_links to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_item_document_links for each row execute function public.trip_core_guard_write();

alter table public.trip_item_participants enable row level security;
revoke all on public.trip_item_participants from public,anon,authenticated,service_role;
grant select on public.trip_item_participants to authenticated;
create policy core_v2_actor_read on public.trip_item_participants for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',item_id));
grant select on public.trip_item_participants to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_item_participants to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_item_participants to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_item_participants for each row execute function public.trip_core_guard_write();

alter table public.trip_entitlement_holders enable row level security;
revoke all on public.trip_entitlement_holders from public,anon,authenticated,service_role;
grant select on public.trip_entitlement_holders to authenticated;
create policy core_v2_actor_read on public.trip_entitlement_holders for select to authenticated using (public.trip_core_authenticated_root_access('ENTITLEMENT',entitlement_id));
grant select on public.trip_entitlement_holders to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_entitlement_holders to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_entitlement_holders to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_entitlement_holders for each row execute function public.trip_core_guard_write();

alter table public.trip_item_visibility_people enable row level security;
revoke all on public.trip_item_visibility_people from public,anon,authenticated,service_role;
grant select on public.trip_item_visibility_people to authenticated;
create policy core_v2_actor_read on public.trip_item_visibility_people for select to authenticated using (public.trip_core_authenticated_root_access('ITEM',item_id));
grant select on public.trip_item_visibility_people to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_item_visibility_people to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_item_visibility_people to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_item_visibility_people for each row execute function public.trip_core_guard_write();

alter table public.trip_booking_visibility_people enable row level security;
revoke all on public.trip_booking_visibility_people from public,anon,authenticated,service_role;
grant select on public.trip_booking_visibility_people to authenticated;
create policy core_v2_actor_read on public.trip_booking_visibility_people for select to authenticated using (public.trip_core_authenticated_root_access('BOOKING',booking_id));
grant select on public.trip_booking_visibility_people to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_booking_visibility_people to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_booking_visibility_people to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_booking_visibility_people for each row execute function public.trip_core_guard_write();

alter table public.trip_entitlement_visibility_people enable row level security;
revoke all on public.trip_entitlement_visibility_people from public,anon,authenticated,service_role;
grant select on public.trip_entitlement_visibility_people to authenticated;
create policy core_v2_actor_read on public.trip_entitlement_visibility_people for select to authenticated using (public.trip_core_authenticated_root_access('ENTITLEMENT',entitlement_id));
grant select on public.trip_entitlement_visibility_people to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_entitlement_visibility_people to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_entitlement_visibility_people to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_entitlement_visibility_people for each row execute function public.trip_core_guard_write();

alter table public.trip_document_visibility_people enable row level security;
revoke all on public.trip_document_visibility_people from public,anon,authenticated,service_role;
grant select on public.trip_document_visibility_people to authenticated;
create policy core_v2_actor_read on public.trip_document_visibility_people for select to authenticated using (public.trip_core_authenticated_root_access('DOCUMENT',document_id));
grant select on public.trip_document_visibility_people to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_document_visibility_people to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_document_visibility_people to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_document_visibility_people for each row execute function public.trip_core_guard_write();

alter table public.trip_instruction_visibility_people enable row level security;
revoke all on public.trip_instruction_visibility_people from public,anon,authenticated,service_role;
grant select on public.trip_instruction_visibility_people to authenticated;
create policy core_v2_actor_read on public.trip_instruction_visibility_people for select to authenticated using (public.trip_core_authenticated_root_access('INSTRUCTION',instruction_id));
grant select on public.trip_instruction_visibility_people to otr_trip_core_v2_gateway;
grant select,insert,update,delete on public.trip_instruction_visibility_people to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_instruction_visibility_people to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_instruction_visibility_people for each row execute function public.trip_core_guard_write();

alter table public.trip_core_command_receipts enable row level security;
revoke all on public.trip_core_command_receipts from public,anon,authenticated,service_role;
grant select on public.trip_core_command_receipts to otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_core_command_receipts to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_core_command_receipts to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_core_command_receipts for each row execute function public.trip_core_guard_write();

alter table public.trip_core_read_state enable row level security;
revoke all on public.trip_core_read_state from public,anon,authenticated,service_role;
grant select on public.trip_core_read_state to otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_core_read_state to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_core_read_state to otr_trip_core_v2_writer using(true) with check(true);

alter table public.trip_source_core_v2_candidates enable row level security;
revoke all on public.trip_source_core_v2_candidates from public,anon,authenticated,service_role;
grant select on public.trip_source_core_v2_candidates to otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_source_core_v2_candidates to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_source_core_v2_candidates to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_source_core_v2_candidates for each row execute function public.trip_core_guard_write();

alter table public.trip_source_core_v2_intents enable row level security;
revoke all on public.trip_source_core_v2_intents from public,anon,authenticated,service_role;
grant select on public.trip_source_core_v2_intents to otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_source_core_v2_intents to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_source_core_v2_intents to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_source_core_v2_intents for each row execute function public.trip_core_guard_write();

alter table public.trip_source_core_v2_slots enable row level security;
revoke all on public.trip_source_core_v2_slots from public,anon,authenticated,service_role;
grant select on public.trip_source_core_v2_slots to otr_trip_core_v2_gateway;
grant select,insert,update on public.trip_source_core_v2_slots to otr_trip_core_v2_writer;
create policy core_v2_writer on public.trip_source_core_v2_slots to otr_trip_core_v2_writer using(true) with check(true);
create trigger core_v2_write_guard before insert or update or delete on public.trip_source_core_v2_slots for each row execute function public.trip_core_guard_write();

commit;
