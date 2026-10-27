"""P6 minimal date-only Activity delta from accepted P5; no hosted connection or activation."""
import hashlib,json
from pathlib import Path
packet=Path(__file__).resolve().parent
meta=json.loads((packet/'P6_FUNCTION_PREIMAGES.json').read_text())
old={k:v['definition'] for k,v in meta.items()};new=dict(old)
h='trip_core_guard_historical_source_association()'
c='trip_sustained_import_p1_capabilities(uuid,uuid)'
g='trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'
def replace(k,a,b,count=1):
 assert new[k].count(a)==count,(k,a,new[k].count(a))
 new[k]=new[k].replace(a,b)
replace(h,"(ps.output_purpose->>'purposeKind'='P5_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p5-source/1')", "(ps.output_purpose->>'purposeKind'='P5_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p5-source/1') OR (ps.output_purpose->>'purposeKind'='P6_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p6-source/1')")
replace(c,"p.universal_p1_review_scope->>'family' IN ('P4','P5')","p.universal_p1_review_scope->>'family' IN ('P4','P5','P6')")
replace(g,"coalesce(family,'') NOT IN ('P1','P3','P4','P5')","coalesce(family,'') NOT IN ('P1','P3','P4','P5','P6')")
replace(g,"WHEN family='P5' THEN 'otr.core.universal-p5-source/1'","WHEN family='P5' THEN 'otr.core.universal-p5-source/1' WHEN family='P6' THEN 'otr.core.universal-p6-source/1'",4)
replace(g,"IF (family IN ('P3','P4','P5') OR","IF (family IN ('P3','P4','P5','P6') OR")
replace(g,"WHEN family='P5' THEN 'otr.universal.p5-source-review/1'","WHEN family='P5' THEN 'otr.universal.p5-source-review/1' WHEN family='P6' THEN 'otr.universal.p6-source-review/1'")
replace(g,"OR family IN ('P4','P5'))","OR family IN ('P4','P5','P6'))")
replace(g,"(tab='trip_activity_details' AND family<>'P1')","(tab='trip_activity_details' AND family NOT IN ('P1','P6'))")
payload="r->'candidate_json'->'plan'->'slots'->0->'payload'"
review="""   IF family='P6' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 2
     OR jsonb_strip_nulls("""+payload+"""->'schedule'->'start') IS DISTINCT FROM jsonb_build_object('local_date',review_scope->>'localDate','quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR ("""+payload+"""->'schedule')-'start' IS DISTINCT FROM '{}'::jsonb
     OR ("""+payload+""")-ARRAY['family','core','schedule','participation','acl'] IS DISTINCT FROM '{}'::jsonb
     OR ("""+payload+"""->'core')-'title' IS DISTINCT FROM '{}'::jsonb
   ) THEN RAISE EXCEPTION 'P6_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
"""
replace(g,"   IF family='P5' AND (\n",review+"   IF family='P5' AND (\n")
rows="""   IF family='P6' AND (r->>'temporal_shape' IS DISTINCT FROM 'CALENDAR'
     OR r->>'start_local_date' IS DISTINCT FROM review_scope->>'localDate'
     OR r->>'start_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'start_source_instant' IS NOT NULL
     OR r->>'end_local_date' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL OR r->>'end_source_instant' IS NOT NULL
     OR r->>'description' IS NOT NULL OR r->>'activity_category' IS NOT NULL OR r->>'reservation_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P6_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
"""
# Insert before the P5 row guard, not its earlier candidate guard.
replace(g,"   IF family='P5' AND (r->>'temporal_shape'",rows+"   IF family='P5' AND (r->>'temporal_shape'")
replace(g,"ELSIF tab IN ('trip_activity_details','trip_stay_details','trip_rental_details') AND", "ELSIF tab='trip_activity_details' AND family='P6' AND (r->>'session_label' IS NOT NULL OR r->>'admission_note' IS NOT NULL) THEN RAISE EXCEPTION 'P6_UNSELECTED_DETAILS' USING ERRCODE='23514';\nELSIF tab IN ('trip_activity_details','trip_stay_details','trip_rental_details') AND")
(packet/'P6_FUNCTION_POSTIMAGES.json').write_text(json.dumps(new,indent=2)+'\n')
def literal(v):return "'"+v.replace("'","''")+"'"
def package(reverse):
 before,after=(new,old) if reverse else (old,new)
 s="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,6);\nDO $guard$ BEGIN\n"
 s+="IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'P6_REQUIRES_CLOSED_POLICY';END IF;\n"
 if reverse:
  s+="IF EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots ss JOIN public.trip_core_command_receipts rr\n ON rr.operation_id=ss.operation_id AND rr.actor_account_id=ss.account_id AND rr.trip_id=ss.trip_id AND rr.intent_sha256=ss.intent_sha256\n WHERE ss.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND ss.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid\n AND ss.output_purpose->>'purposeKind'='P6_ITEM' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND\n (ss.state IS DISTINCT FROM 'COMPLETE' OR ss.domain_receipt_id IS DISTINCT FROM rr.id\n OR NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.output_slot_id=ss.output_slot_id\n AND a.domain_receipt_id=rr.id AND a.receipt_sha256=rr.receipt_sha256 AND a.account_id=ss.account_id AND a.trip_id=ss.trip_id\n AND a.source_id=ss.source_id AND a.candidate_id=ss.candidate_id AND a.target_kind=ss.target_kind AND a.target_id=ss.target_id AND a.identity_sha256=ss.identity_sha256)))\n THEN RAISE EXCEPTION 'P6_ACCEPTED_SOURCE_RECOVERY_REQUIRED';END IF;\n"
 for k in old:
  sig=literal('public.'+k)+'::regprocedure'
  s+="IF md5(pg_get_functiondef("+sig+")) IS DISTINCT FROM "+literal(hashlib.md5(before[k].encode()).hexdigest())+" OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['owner'])+" OR (SELECT proacl::text FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['acl'])+" THEN RAISE EXCEPTION 'P6_FUNCTION_DRIFT';END IF;\n"
 s+="END $guard$;\n"+';\n'.join(after.values())+';\n'
 for k in old:s+="DO $guard$ BEGIN IF md5(pg_get_functiondef("+literal('public.'+k)+"::regprocedure)) IS DISTINCT FROM "+literal(hashlib.md5(after[k].encode()).hexdigest())+" THEN RAISE EXCEPTION 'P6_POSTIMAGE_DRIFT';END IF;END $guard$;\n"
 return s+'COMMIT;\n'
for reverse in (False,True):(packet/('P6_DEV_ROLLBACK.sql' if reverse else 'P6_DEV_INSTALL.sql')).write_text(package(reverse))
files=['P6_FUNCTION_PREIMAGES.json','P6_FUNCTION_POSTIMAGES.json','P6_DEV_INSTALL.sql','P6_DEV_ROLLBACK.sql']
(packet/'P6_PACKAGE_SHA256.json').write_text(json.dumps({f:hashlib.sha256((packet/f).read_bytes()).hexdigest() for f in files},indent=2)+'\n')
print(json.dumps({'status':'P6_DEFAULT_CLOSED_CANDIDATE_NOT_INSTALLED','functions':list(old),'schemaGrantsRolesAdded':0}))
