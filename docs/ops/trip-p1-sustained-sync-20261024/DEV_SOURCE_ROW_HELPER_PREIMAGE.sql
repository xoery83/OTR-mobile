CREATE OR REPLACE FUNCTION public.trip_core_source_review_row_allowed(tab text, op text, n jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid:=(n->>'account_id')::uuid;trip uuid:=(n->>'trip_id')::uuid;source uuid:=(n->>'source_id')::uuid;rev bigint:=(n->>'source_revision')::bigint;
 p public.trip_source_core_v2_publications;q jsonb;result jsonb;b jsonb;candidate jsonb;decision jsonb;expected jsonb;
begin
 if op<>'INSERT' or tab not in ('trip_source_core_v2_publications','trip_source_core_v2_candidates','trip_source_core_v2_intents') or current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' then return false;end if;
 if actor is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid or not public.trip_core_source_review_scope_allowed(actor,trip) then return false;end if;
 if tab='trip_source_core_v2_publications' then
  q:=n->'request_json';result:=n->'response_json';
  if not public.trip_core_source_review_material_allowed(actor,trip,source,rev,(n->>'run_id')::uuid,n->>'input_catalog_sha256') then return false;end if;
  if q->'publicationVersion'='2'::jsonb then
   return coalesce(q->>'publicationId'=n->>'publication_id' and q->>'sourceId'=source::text and (q->>'sourceRevision')::bigint=rev and q->>'runId'=n->>'run_id' and q->>'inputCatalogSha256'=n->>'input_catalog_sha256'
    and n->>'request_sha256'=public.trip_source_hash('otr-trip-core-source-publication-v2',q)
    and result->'publicationVersion'='2'::jsonb and result->>'publicationId'=n->>'publication_id' and result->>'requestSha256'=n->>'request_sha256'
    and result->>'accountId'=actor::text and result->>'tripId'=trip::text and result->>'sourceId'=source::text and result->>'runId'=n->>'run_id'
    and jsonb_typeof(q->'candidates')='array' and jsonb_array_length(q->'candidates') between 1 and 64
    and jsonb_array_length(result->'candidates')=jsonb_array_length(q->'candidates'),false);
  elsif q->'commercialVersion'='1'::jsonb then
   b:=q->'binding';candidate:=q->'publication'->'candidate';
   return coalesce(b->>'accountId'=actor::text and b->>'tripId'=trip::text and b->>'sourceId'=source::text and (b->>'sourceRevision')::bigint=rev and b->>'runId'=n->>'run_id' and b->>'publicationId'=n->>'publication_id' and b->>'inputCatalogSha256'=n->>'input_catalog_sha256'
    and candidate->>'kind'='BOOKING' and candidate->>'candidateId'=b->>'candidateId'
    and b->>'candidateSha256'=public.trip_source_hash('otr-source-commercial-candidate-v1',candidate)
    and n->>'request_sha256'=public.trip_source_hash('otr-source-commercial-publication-v1',q->'publication')
    and result->'commercialVersion'='1'::jsonb and result->'binding'=b and result->>'publicationSha256'=n->>'request_sha256'
    and result->>'state'='REVIEW_REQUIRED' and result->'decision'='null'::jsonb and result->>'admission'='BLOCKED' and result->'readyCommands'='[]'::jsonb,false);
  end if;return false;
 elsif tab='trip_source_core_v2_candidates' then
  candidate:=n->'candidate_json';
  if not public.trip_core_source_review_material_allowed(actor,trip,source,rev,(n->>'run_id')::uuid,n->>'input_catalog_sha256') then return false;end if;
  if candidate->'version'='2'::jsonb then
   select * into p from public.trip_source_core_v2_publications where publication_id=(candidate->>'publicationId')::uuid;
   return coalesce(p.account_id=actor and p.trip_id=trip and p.source_id=source and p.source_revision=rev and p.run_id=(n->>'run_id')::uuid and p.input_catalog_sha256=n->>'input_catalog_sha256'
    and p.request_json->'publicationVersion'='2'::jsonb
    and candidate->'candidate'=any(array(select value from jsonb_array_elements(p.request_json->'candidates')))
    and candidate->'candidate'->>'candidateId'=n->>'candidate_id' and candidate->'candidate'->>'kind'='P2'
    and n->>'candidate_sha256'=public.trip_source_hash('otr-trip-core-source-candidate-v2',candidate)
    and exists(select 1 from jsonb_array_elements(p.response_json->'candidates') c where c->>'candidateId'=n->>'candidate_id' and c->>'candidateSha256'=n->>'candidate_sha256' and c->>'status'=candidate->>'status' and c->'errorCode'=candidate->'errorCode'),false);
  elsif candidate->>'kind'='BOOKING' then
   select * into p from public.trip_source_core_v2_publications where account_id=actor and trip_id=trip and source_id=source and source_revision=rev and run_id=(n->>'run_id')::uuid and request_json->'publication'->'candidate'=candidate;
   return coalesce(p.publication_id is not null and p.request_json->'commercialVersion'='1'::jsonb and candidate->>'candidateId'=n->>'candidate_id' and n->>'candidate_sha256'=public.trip_source_hash('otr-source-commercial-candidate-v1',candidate) and p.request_json->'binding'->>'candidateSha256'=n->>'candidate_sha256',false);
  end if;return false;
 else
  q:=n->'request_json';result:=n->'prepared_json'->'result';b:=q->'binding';decision:=result->'decision';
  select * into p from public.trip_source_core_v2_publications where publication_id=(b->>'publicationId')::uuid and account_id=actor and trip_id=trip and source_id=source and source_revision=rev;
  if p.publication_id is null or not public.trip_core_source_review_material_allowed(actor,trip,source,rev,p.run_id,p.input_catalog_sha256) then return false;end if;
  if not exists(select 1 from public.trip_source_core_v2_candidates where candidate_id=(b->>'candidateId')::uuid and account_id=actor and trip_id=trip and source_id=source and candidate_json=p.request_json->'publication'->'candidate') then return false;end if;
  select jsonb_agg('BOOKING.'||key order by key) into expected from jsonb_each(p.request_json->'publication'->'candidate'->'facts'->'fields');
  if (select jsonb_agg(value order by value) from jsonb_array_elements(q->'selectedFields')) is distinct from (select jsonb_agg(value order by value) from jsonb_array_elements(expected)) then return false;end if;
  perform pg_advisory_xact_lock(hashtextextended('otr-commercial-decision:'||actor||':'||(q->>'decisionId'),0));
  if exists(select 1 from public.trip_source_core_v2_intents where account_id=actor and trip_id=trip and prepared_json->'result'->'decision'->>'decisionId'=q->>'decisionId') then return false;end if;
  return coalesce(q->'commercialVersion'='1'::jsonb and q->>'action'='CONFIRM_SELECTION' and b=p.request_json->'binding' and b->>'planId'=n->>'plan_id'
   and q->>'publicationSha256'=p.request_sha256 and n->>'request_sha256'=public.trip_source_hash('otr-source-commercial-review-request-v1',q)
   and n->'prepared_json'->'commercialVersion'='1'::jsonb and n->'prepared_json'->'request'=q
   and result->>'state'='DECISION_SAVED' and result->'binding'=b and result->>'publicationSha256'=p.request_sha256 and result->>'admission'='BLOCKED' and result->'readyCommands'='[]'::jsonb
   and decision->>'decisionId'=q->>'decisionId' and decision->'decisionRevision'='1'::jsonb and decision->'binding'=b and decision->>'publicationSha256'=p.request_sha256 and decision->'selectedFields'=q->'selectedFields'
   and decision->>'decisionSha256'=public.trip_source_hash('otr-source-commercial-review-v1',decision-'decisionSha256'),false);
 end if;
exception when others then return false;
end$function$
