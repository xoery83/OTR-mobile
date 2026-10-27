import json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[3]
packet=root/'docs/ops/universal-p456-formal-save-20261027'
base=root/'docs/ops/universal-p2-formal-save-20261027'
old=json.loads((base/'P2_REVIEW_FUNCTION_POSTIMAGES.json').read_text())
meta=json.loads((base/'P2_REVIEW_FUNCTION_PREIMAGES.json').read_text())
names=['trip_core_guard_historical_source_association()','trip_sustained_import_p1_capabilities(uuid,uuid)','trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)']
new={k:old[k] for k in names}
def replace(k,a,b,count=1):
 assert new[k].count(a)==count,(k,a,new[k].count(a))
 new[k]=new[k].replace(a,b)
h,c,g=names
replace(h,"(ps.output_purpose->>'purposeKind'='P3_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p3-source/1')","(ps.output_purpose->>'purposeKind'='P3_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p3-source/1') OR (ps.output_purpose->>'purposeKind'='P4_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p4-source/1')")
qa="actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid"
replace(c,"coalesce(p.universal_p1_review_scope->>'family','P1') IN ('P1','P3')","(coalesce(p.universal_p1_review_scope->>'family','P1') IN ('P1','P3') OR (p.universal_p1_review_scope->>'family'='P4' AND "+qa+"))")
replace(g,"coalesce(family,'') NOT IN ('P1','P3')","coalesce(family,'') NOT IN ('P1','P3','P4')")
replace(g,"tab NOT IN ('itinerary_events','trip_activity_details','trip_stay_details'","tab NOT IN ('itinerary_events','trip_activity_details','trip_stay_details','trip_rental_details'")
for a in ["CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/1' END","CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/2' END"]:
 replace(g,a,a.replace(" ELSE "," WHEN family='P4' THEN 'otr.core.universal-p4-source/1' ELSE "),2)
replace(g,"(family='P3' OR r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2')","(family IN ('P3','P4') OR r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2')")
replace(g,"CASE WHEN family='P3' THEN 'otr.universal.p3-source-review/1' ELSE 'otr.universal.p1-source-review/1' END","CASE WHEN family='P3' THEN 'otr.universal.p3-source-review/1' WHEN family='P4' THEN 'otr.universal.p4-source-review/1' ELSE 'otr.universal.p1-source-review/1' END")
marker="   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE"
p4review="""    IF family='P4' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM review_scope->>'endLocalDate'
     OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM CASE WHEN r->'candidate_json'->'sourceReview'->>'endLocalDate' IS NULL THEN 2 ELSE 3 END
     OR (r->'candidate_json'->'sourceReview'->>'endLocalDate' IS NOT NULL AND
       (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='END.local_date')
        OR (r->'candidate_json'->'sourceReview'->>'endLocalDate')::date < (r->'candidate_json'->'sourceReview'->>'localDate')::date))
    ) THEN RAISE EXCEPTION 'P4_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
"""
replace(g,marker,p4review+marker)
replace(g,"(family='P3' AND e->>'fieldKey'='END.local_date')","(family IN ('P3','P4') AND e->>'fieldKey'='END.local_date')")
# P4 date normalization remains an exact English-month/civil-date evidence transformation.
replace(g,"r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2'\n      AND e->>'fieldKey'='START.local_date'","(r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2' OR family='P4')\n       AND (e->>'fieldKey'='START.local_date' OR (family='P4' AND e->>'fieldKey'='END.local_date'))")
replace(g,"e->'normalization'->>'value'=r->'candidate_json'->'sourceReview'->>'localDate'","e->'normalization'->>'value'=CASE WHEN e->>'fieldKey'='END.local_date' THEN r->'candidate_json'->'sourceReview'->>'endLocalDate' ELSE r->'candidate_json'->'sourceReview'->>'localDate' END")
marker="ELSIF (tab='trip_activity_details' AND family<>'P1')"
p4item="""   IF family='P4' AND (r->>'end_local_date' IS DISTINCT FROM candidate.candidate_json->'sourceReview'->>'endLocalDate'
     OR r->>'start_local_time' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P4_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
"""
replace(g,marker,p4item+marker)
replace(g,"(tab='trip_stay_details' AND family<>'P3') THEN","(tab='trip_stay_details' AND family<>'P3') OR (tab='trip_rental_details' AND family<>'P4') THEN")
replace(g,"tab IN ('trip_activity_details','trip_stay_details') AND r->>'event_id'","tab IN ('trip_activity_details','trip_stay_details','trip_rental_details') AND r->>'event_id'")
marker="ELSIF tab IN ('trip_activity_details','trip_stay_details','trip_rental_details') AND"
p4details="""   ELSIF tab='trip_rental_details' AND (r->>'supplier' IS NOT NULL OR r->>'reserved_category' IS NOT NULL OR r->>'or_similar' IS NOT NULL OR r->>'actual_vehicle_model' IS NOT NULL OR r->>'verified_plate' IS NOT NULL)
     THEN RAISE EXCEPTION 'P4_UNSELECTED_DETAILS' USING ERRCODE='23514';
"""
replace(g,marker,p4details+marker)
assert all(new[k]!=old[k] for k in names)
pre={k:{**meta[k],'md5':hashlib.md5(old[k].encode()).hexdigest(),'definition':old[k]} for k in names}
(packet/'P4_FUNCTION_PREIMAGES.json').write_text(json.dumps(pre,indent=2)+'\n')
(packet/'P4_FUNCTION_POSTIMAGES.json').write_text(json.dumps(new,indent=2)+'\n')
def literal(v):return "'"+v.replace("'","''")+"'"
def package(reverse):
 before=new if reverse else old;after=old if reverse else new
 text="BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,4);\nDO $guard$ BEGIN\n"
 text+="IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'P4_REQUIRES_CLOSED_POLICY';END IF;\n"
 if reverse:
  text+="""IF EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots ss JOIN public.trip_core_command_receipts rr
 ON rr.operation_id=ss.operation_id AND rr.actor_account_id=ss.account_id AND rr.trip_id=ss.trip_id AND rr.intent_sha256=ss.intent_sha256
 WHERE ss.account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND ss.trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
 AND ss.output_purpose->>'purposeKind'='P4_ITEM' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND
 (ss.state IS DISTINCT FROM 'COMPLETE' OR ss.domain_receipt_id IS DISTINCT FROM rr.id
 OR NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a WHERE a.output_slot_id=ss.output_slot_id
 AND a.domain_receipt_id=rr.id AND a.receipt_sha256=rr.receipt_sha256 AND a.account_id=ss.account_id AND a.trip_id=ss.trip_id
 AND a.source_id=ss.source_id AND a.candidate_id=ss.candidate_id AND a.target_kind=ss.target_kind AND a.target_id=ss.target_id AND a.identity_sha256=ss.identity_sha256)))
 THEN RAISE EXCEPTION 'P4_ACCEPTED_SOURCE_RECOVERY_REQUIRED';END IF;\n"""
 for k in names:
  sig=literal('public.'+k)+'::regprocedure'
  text+="IF md5(pg_get_functiondef("+sig+")) IS DISTINCT FROM "+literal(hashlib.md5(before[k].encode()).hexdigest())+" OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['owner'])+" OR (SELECT proacl::text FROM pg_proc WHERE oid="+sig+") IS DISTINCT FROM "+literal(meta[k]['acl'])+" THEN RAISE EXCEPTION 'P4_FUNCTION_DRIFT';END IF;\n"
 text+="END $guard$;\n"+';\n'.join(after[k] for k in names)+";\n"
 for k in names:
  text+="DO $guard$ BEGIN IF md5(pg_get_functiondef("+literal('public.'+k)+"::regprocedure)) IS DISTINCT FROM "+literal(hashlib.md5(after[k].encode()).hexdigest())+" THEN RAISE EXCEPTION 'P4_POSTIMAGE_DRIFT';END IF;END $guard$;\n"
 return text+'COMMIT;\n'
for reverse in [False,True]:(packet/('P4_DEV_ROLLBACK.sql' if reverse else 'P4_DEV_INSTALL.sql')).write_text(package(reverse))
files=['P4_FUNCTION_PREIMAGES.json','P4_FUNCTION_POSTIMAGES.json','P4_DEV_INSTALL.sql','P4_DEV_ROLLBACK.sql']
(packet/'P4_PACKAGE_SHA256.json').write_text(json.dumps({f:hashlib.sha256((packet/f).read_bytes()).hexdigest() for f in files},indent=2)+'\n')
print(json.dumps({'status':'P4_DEFAULT_CLOSED_PACKAGE_PREPARED','functions':names,'schemaGrantsRolesAdded':0,'hostedInstalled':False}))
