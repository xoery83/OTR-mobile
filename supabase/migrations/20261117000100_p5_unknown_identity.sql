-- Candidate only: deploy compatible readers before advertising P5 unknown identity v1.
BEGIN;
ALTER TABLE public.itinerary_transport_services ADD COLUMN identity_state jsonb;
ALTER TABLE public.itinerary_transport_services DROP CONSTRAINT core_v2_required_fields;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_namespace DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_issuer DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_value DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN operator_literal DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN service_number DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ALTER COLUMN service_literal DROP NOT NULL;
ALTER TABLE public.itinerary_transport_services ADD CONSTRAINT core_v2_required_fields CHECK (
 trip_id IS NULL OR (event_id IS NOT NULL AND service_key IS NOT NULL AND transport_subtype IS NOT NULL AND attribution IS NOT NULL)
);
ALTER TABLE public.itinerary_transport_services ADD CONSTRAINT p5_identity_state_v1 CHECK ((
 (identity_state IS NULL AND operator_namespace IS NOT NULL AND operator_issuer IS NOT NULL AND operator_value IS NOT NULL AND operator_literal IS NOT NULL AND service_number IS NOT NULL AND service_literal IS NOT NULL)
 OR (trip_id IS NOT NULL AND transport_subtype IN ('TRAIN','BUS','FERRY','WATER_TAXI','SHUTTLE','TRANSFER')
 AND (operator_namespace IS DISTINCT FROM 'IATA_AIRLINE' OR (operator_issuer='IATA' AND operator_value ~ '^[A-Z0-9]{2}$') IS TRUE)
 AND (operator_namespace IS DISTINCT FROM 'ICAO_AIRLINE' OR (operator_issuer='ICAO' AND operator_value ~ '^[A-Z]{3}$') IS TRUE)
 AND jsonb_typeof(identity_state)='object'
 AND identity_state->'version'='1'::jsonb
 AND identity_state - ARRAY['version','fields']='{}'::jsonb
 AND jsonb_typeof(identity_state->'fields')='object'
 AND (identity_state->'fields') - ARRAY['operator_namespace','operator_issuer','operator_value','operator_literal','service_number','service_literal']='{}'::jsonb
 AND ((identity_state#>>'{fields,operator_namespace}'='KNOWN' AND operator_namespace IS NOT NULL AND btrim(operator_namespace,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_namespace}' IN ('UNKNOWN') AND operator_namespace IS NULL))
 AND ((identity_state#>>'{fields,operator_issuer}'='KNOWN' AND operator_issuer IS NOT NULL AND btrim(operator_issuer,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_issuer}' IN ('UNKNOWN') AND operator_issuer IS NULL))
 AND ((identity_state#>>'{fields,operator_value}'='KNOWN' AND operator_value IS NOT NULL AND btrim(operator_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_value}' IN ('UNKNOWN') AND operator_value IS NULL))
 AND ((identity_state#>>'{fields,operator_literal}'='KNOWN' AND operator_literal IS NOT NULL AND btrim(operator_literal,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,operator_literal}' IN ('UNKNOWN') AND operator_literal IS NULL))
 AND ((identity_state#>>'{fields,service_number}'='KNOWN' AND service_number IS NOT NULL AND btrim(service_number,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,service_number}' IN ('UNKNOWN','NOT_APPLICABLE') AND service_number IS NULL))
 AND ((identity_state#>>'{fields,service_literal}'='KNOWN' AND service_literal IS NOT NULL AND btrim(service_literal,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'')
 OR (identity_state#>>'{fields,service_literal}' IN ('UNKNOWN') AND service_literal IS NULL))
 )) IS TRUE);
-- Existing nonempty, enum, length, IATA/ICAO, codeshare and aggregate checks remain.
INSERT INTO public.trip_core_field_registry(table_name,field_name) VALUES('itinerary_transport_services','identity_state');
COMMIT;
