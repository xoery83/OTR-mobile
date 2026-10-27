"""Default-closed delta from fixed accepted P4 functions; no connection or activation."""
import hashlib,json
from pathlib import Path
packet=Path(__file__).resolve().parent
meta=json.loads((packet/'P5_FUNCTION_PREIMAGES.json').read_text())
old={k:v['definition'] for k,v in meta.items()};new=dict(old)
h='trip_core_guard_historical_source_association()'
c='trip_sustained_import_p1_capabilities(uuid,uuid)'
g='trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'
def replace(k,a,b,count=1):
 assert new[k].count(a)==count,(k,a,new[k].count(a))
 new[k]=new[k].replace(a,b)
statement='trip_core_service_statement_guard()'
replace(statement,"not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled)", """(not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) AND NOT ((
    tg_op='INSERT' AND current_setting('otr.core.command',true)='CREATE_ITEM'
    AND current_setting('otr.core.family',true)='P5' AND current_setting('otr.core.admission',true)='REVIEWED_SOURCE'
    AND current_setting('otr.core.actor',true)='f4b059c5-8241-4ffb-aa15-37fa25474543'
    AND current_setting('otr.core.trip',true)='825f79b2-4a9d-4535-a62e-43000ca50c4a'
    AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities('f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid,'825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid) c WHERE c.runtime_enabled AND c.enabled_families=ARRAY['P5']::text[] AND c.enabled_commands=ARRAY['CREATE_ITEM']::text[] AND c.enabled_admission_modes=ARRAY['REVIEWED_SOURCE']::text[])
  ) IS TRUE))""")
replace(h,"(ps.output_purpose->>'purposeKind'='P4_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p4-source/1')","(ps.output_purpose->>'purposeKind'='P4_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p4-source/1') OR (ps.output_purpose->>'purposeKind'='P5_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p5-source/1')")
replace(c,"p.universal_p1_review_scope->>'family'='P4'", "p.universal_p1_review_scope->>'family' IN ('P4','P5')")
replace(g,"coalesce(family,'') NOT IN ('P1','P3','P4')","coalesce(family,'') NOT IN ('P1','P3','P4','P5')")
replace(g,"tab NOT IN ('itinerary_events','trip_activity_details'","tab NOT IN ('itinerary_events','itinerary_transport_endpoints','itinerary_transport_services','trip_activity_details'")
replace(g,"WHEN family='P4' THEN 'otr.core.universal-p4-source/1'", "WHEN family='P4' THEN 'otr.core.universal-p4-source/1' WHEN family='P5' THEN 'otr.core.universal-p5-source/1'",4)
replace(g,"IF (family IN ('P3','P4') OR", "IF (family IN ('P3','P4','P5') OR")
replace(g,"WHEN family='P4' THEN 'otr.universal.p4-source-review/1'", "WHEN family='P4' THEN 'otr.universal.p4-source-review/1' WHEN family='P5' THEN 'otr.universal.p5-source-review/1'")
payload="r->'candidate_json'->'plan'->'slots'->0->'payload'"
schedule_date=payload+"->'schedule'->'start'->>'local_date'"
origin_date=payload+"->'endpoints'->'origin'->'time'->>'local_date'"
replace(g,"r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM "+schedule_date,"r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM CASE WHEN family='P5' THEN "+origin_date+" ELSE "+schedule_date+" END")
replace(g,"WHEN 'START.local_date' THEN "+schedule_date,"WHEN 'START.local_date' THEN CASE WHEN family='P5' THEN "+origin_date+" ELSE "+schedule_date+" END WHEN 'SERVICE.main.transport_subtype' THEN "+payload+"->'service'->>'transport_subtype' WHEN 'SERVICE.main.operator_literal' THEN "+payload+"->'service'->>'operator_literal' WHEN 'SERVICE.main.service_number' THEN "+payload+"->'service'->>'service_number'")
replace(g,"AND NOT (family IN ('P3','P4') AND e->>'fieldKey'='END.local_date')", "AND NOT (family IN ('P3','P4') AND e->>'fieldKey'='END.local_date') AND NOT (family='P5' AND e->>'fieldKey' IN ('SERVICE.main.transport_subtype','SERVICE.main.operator_literal','SERVICE.main.service_number'))")
marker="   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE"
review="""   IF family='P5' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 5
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.transport_subtype' AND e->>'raw'='TRAIN')
     OR PAYLOAD->'service' IS DISTINCT FROM jsonb_build_object('service_key','main','transport_subtype','TRAIN','attribution','UNSPECIFIED','operator_namespace','NAME','operator_issuer','NAME','operator_value',review_scope->>'operatorLiteral','operator_literal',review_scope->>'operatorLiteral','service_number',review_scope->>'serviceNumber','service_literal',review_scope->>'title','codeshare_operating_key',null)
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.operator_literal' AND e->>'raw'=review_scope->>'operatorLiteral')
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.service_number' AND e->>'raw'=review_scope->>'serviceNumber')
     OR jsonb_strip_nulls(PAYLOAD->'endpoints'->'origin'->'time') IS DISTINCT FROM jsonb_build_object('local_date',review_scope->>'localDate','quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR jsonb_strip_nulls(PAYLOAD->'endpoints'->'destination'->'time') IS DISTINCT FROM jsonb_build_object('quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR jsonb_strip_nulls(PAYLOAD->'endpoints'->'origin'->'place') IS DISTINCT FROM '{}'::jsonb
     OR jsonb_strip_nulls(PAYLOAD->'endpoints'->'destination'->'place') IS DISTINCT FROM '{}'::jsonb
     OR ((PAYLOAD)-ARRAY['family','core','endpoints','service','participation','acl']) IS DISTINCT FROM '{}'::jsonb
     OR jsonb_typeof(PAYLOAD->'endpoints') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(PAYLOAD->'endpoints')) IS DISTINCT FROM 2::bigint
   ) THEN RAISE EXCEPTION 'P5_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
""".replace('PAYLOAD',payload)
replace(g,marker,review+marker)
replace(g,"OR family='P4')", "OR family IN ('P4','P5'))")
marker="ELSIF (tab='trip_activity_details' AND family<>'P1')"
rows="""   IF family='P5' AND (r->>'temporal_shape' IS DISTINCT FROM 'TRANSPORT'
      OR r->>'start_local_date' IS NOT NULL OR r->>'end_local_date' IS NOT NULL
      OR r->>'start_local_time' IS NOT NULL OR r->>'end_local_time' IS NOT NULL
      OR r->>'start_zone_id' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P5_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   ELSIF tab IN ('itinerary_transport_endpoints','itinerary_transport_services') THEN
     IF family<>'P5' OR r->>'event_id' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'SOURCE_FAMILY_TABLE_MISMATCH' USING ERRCODE='42501';END IF;
     SELECT * INTO candidate FROM public.trip_source_core_v2_candidates c WHERE c.candidate_id=slot.candidate_id;
     IF tab='itinerary_transport_services' THEN
       IF r->'provenance_refs' IS DISTINCT FROM '{}'::jsonb OR jsonb_strip_nulls(r-ARRAY['event_id','trip_id','provenance_refs']) IS DISTINCT FROM jsonb_strip_nulls(candidate.candidate_json->'plan'->'slots'->0->'payload'->'service')
       THEN RAISE EXCEPTION 'P5_SOURCE_SERVICE_MISMATCH' USING ERRCODE='23514';END IF;
     ELSE
       IF coalesce(r->>'role','') NOT IN ('ORIGIN','DESTINATION') OR
         jsonb_strip_nulls(r-ARRAY['event_id','trip_id','role']) IS DISTINCT FROM
         jsonb_strip_nulls((candidate.candidate_json->'plan'->'slots'->0->'payload'->'endpoints'->lower(r->>'role')->'time') ||
          (candidate.candidate_json->'plan'->'slots'->0->'payload'->'endpoints'->lower(r->>'role')->'place'))
       THEN RAISE EXCEPTION 'P5_SOURCE_ENDPOINT_MISMATCH' USING ERRCODE='23514';END IF;
     END IF;
"""
replace(g,marker,rows+marker)
(packet/'P5_FUNCTION_POSTIMAGES.json').write_text(json.dumps(new,indent=2)+'\n')
def literal(v):return "'"+v.replace("'","''")+"'"
def package(reverse):
 before,after=(new,old) if reverse else (old,new)
 s="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,5);\nDO $guard$ BEGIN\n"
 s+="IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'P5_REQUIRES_CLOSED_POLICY';END IF;\n"
 if reverse:
  s+="IF EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots ss JOIN public.trip_core_command_receipts rr\n ON rr.operation_id=ss.operation_id AND rr.actor_account_id=ss.account_id AND rr.trip_id=ss.trip_id AND rr.intent_sha256=ss.intent_sha256\n WHERE ss.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND ss.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid\n AND ss.output_purpose->>'purposeKind'='P5_ITEM' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND\n (ss.state IS DISTINCT FROM 'COMPLETE' OR ss.domain_receipt_id IS DISTINCT FROM rr.id\n OR NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.output_slot_id=ss.output_slot_id\n AND a.domain_receipt_id=rr.id AND a.receipt_sha256=rr.receipt_sha256 AND a.account_id=ss.account_id AND a.trip_id=ss.trip_id\n AND a.source_id=ss.source_id AND a.candidate_id=ss.candidate_id AND a.target_kind=ss.target_kind AND a.target_id=ss.target_id AND a.identity_sha256=ss.identity_sha256)))\n THEN RAISE EXCEPTION 'P5_ACCEPTED_SOURCE_RECOVERY_REQUIRED';END IF;\n"
 for k in old:
  sig=literal('public.'+k)+'::regprocedure'
  s+="IF md5(pg_get_functiondef("+sig+")) IS DISTINCT FROM "+literal(hashlib.md5(before[k].encode()).hexdigest())+" OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['owner'])+" OR (SELECT proacl::text FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['acl'])+" THEN RAISE EXCEPTION 'P5_FUNCTION_DRIFT';END IF;\n"
 s+="END $guard$;\n"+';\n'.join(after.values())+';\n'
 for k in old:s+="DO $guard$ BEGIN IF md5(pg_get_functiondef("+literal('public.'+k)+"::regprocedure)) IS DISTINCT FROM "+literal(hashlib.md5(after[k].encode()).hexdigest())+" THEN RAISE EXCEPTION 'P5_POSTIMAGE_DRIFT';END IF;END $guard$;\n"
 return s+'COMMIT;\n'
for reverse in (False,True):(packet/('P5_DEV_ROLLBACK.sql' if reverse else 'P5_DEV_INSTALL.sql')).write_text(package(reverse))
files=['P5_FUNCTION_PREIMAGES.json','P5_FUNCTION_POSTIMAGES.json','P5_DEV_INSTALL.sql','P5_DEV_ROLLBACK.sql']
(packet/'P5_PACKAGE_SHA256.json').write_text(json.dumps({f:hashlib.sha256((packet/f).read_bytes()).hexdigest() for f in files},indent=2)+'\n')
print(json.dumps({'status':'P5_DEFAULT_CLOSED_CANDIDATE_NOT_INSTALLED','functions':list(old),'schemaGrantsRolesAdded':0}))
