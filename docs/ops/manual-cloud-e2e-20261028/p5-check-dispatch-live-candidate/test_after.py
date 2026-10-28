# Raw CHECK-only probe copied from a real accepted unknown-facts P5 row; no FK/authority claims.
sql('set role postgres;CREATE TABLE public.p5_check_probe (LIKE public.itinerary_transport_services INCLUDING ALL);INSERT INTO public.p5_check_probe SELECT * FROM public.itinerary_transport_services WHERE trip_id='+literal(TRIP)+'::uuid LIMIT 1;')
def probe(changes,failure=None):
 statement='BEGIN;SET LOCAL ROLE postgres;UPDATE public.p5_check_probe SET '+changes+';ROLLBACK;'
 if failure:sql(statement,failure=failure)
 else:sql(statement)
for subtype in ('TRAIN','BUS','FERRY','WATER_TAXI','SHUTTLE','TRANSFER'):
 probe('transport_subtype='+literal(subtype))
check('all six supported V2 NAME subtypes retain exact unknown empty facts')
for field,maximum in fields.items():
 probe(field+"=' '",field+'_check')
 probe(field+'=NULL','23502')
 probe(field+'='+literal('x'*(maximum+1)),field+'_check')
 known=','.join(f+'='+literal('KNOWN') for f in fields if f!=field)
 probe(known+','+field+"=''")
check('each of five facts accepts exact empty independently, rejects whitespace/NULL/overlength')
for changes in ["trip_id=NULL","transport_subtype='FLIGHT'","operator_namespace='AUTHORITY'","operator_namespace='IATA_AIRLINE'","operator_namespace='ICAO_AIRLINE'"]:
 probe(changes,'23514')
check('legacy/Flight/nonNAME identities do not inherit unknown-value allowance')
# Stored accepted facts must prevent destructive/pretend rollback.
data_before=sql("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY event_id,service_key)::text) FROM public.itinerary_transport_services s WHERE trip_id="+literal(TRIP)+'::uuid;')
sql('set role postgres;'+(base/'checks-rollback.sql').read_text(),failure='P5_CHECK_ROLLBACK_BLOCKED_RETAIN_DATA')
check('rollback refuses exact old CHECK restore when unknown accepted facts exist',json.loads(sql(constraint_read))==post)
check('failed constraint rollback preserves every accepted service byte',data_before==sql("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY event_id,service_key)::text) FROM public.itinerary_transport_services s WHERE trip_id="+literal(TRIP)+'::uuid;'))

