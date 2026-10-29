"""Offline candidate generation only. No DB/network/Auth access. Inputs must be exact local preimages."""
import json, hashlib
from pathlib import Path
BASE=Path(__file__).resolve().parent
FIELDS={'operator_issuer':128,'operator_value':128,'operator_literal':255,'service_number':64,'service_literal':255}
def lit(v): return "'"+v.replace("'","''")+"'"
def check_rows(rows):
 assert len(rows)==5 and {r['name'] for r in rows}=={'itinerary_transport_services_'+f+'_check' for f in FIELDS}
 for r in rows:
  assert r['validated'] is True and r['type']=='c' and r['table']=='itinerary_transport_services'
 return rows
def cas(rows):
 return '\n'.join("IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.itinerary_transport_services'::regclass AND conname="+lit(r['name'])+" AND contype='c' AND convalidated AND pg_get_constraintdef(oid)="+lit(r['definition'])+") THEN RAISE EXCEPTION 'P5_CHECK_PREIMAGE_DRIFT';END IF;" for r in check_rows(rows))
def header(rows):
 return "-- UNAPPROVED / NOT_INSTALLED. Five CHECK definitions only; no function/role/RLS/GRANT changes.\nBEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\nLOCK TABLE ONLY public.itinerary_transport_services IN ACCESS EXCLUSIVE MODE;\nDO $cas$ BEGIN\n"+cas(rows)+"\nEND $cas$;\n"
def build():
 pre=check_rows(json.loads((BASE/'constraint-preimages.json').read_text()))
 text=header(pre)
 for r in pre:
  f=r['name'].removeprefix('itinerary_transport_services_').removesuffix('_check')
  # Preserve the complete original predicate, including upper bound and trim qualification.
  text+='ALTER TABLE public.itinerary_transport_services DROP CONSTRAINT '+r['name']+';\n'
  text+='ALTER TABLE public.itinerary_transport_services ADD CONSTRAINT '+r['name']+' CHECK (('+r['expression']+") OR ((trip_id IS NOT NULL AND transport_subtype IN ('TRAIN','BUS','FERRY','WATER_TAXI','SHUTTLE','TRANSFER') AND operator_namespace='NAME' AND "+f+"='') IS TRUE));\n"
 (BASE/'checks-install.sql').write_text(text+'COMMIT;\n')
 postpath=BASE/'constraint-postimages.json'
 if postpath.exists():
  post=check_rows(json.loads(postpath.read_text()));undo=header(post)
  # Refuse BEFORE any DDL if any row now uses the new exception. Never delete or fill facts.
  conditions=' OR '.join('NOT (('+r['expression']+') IS TRUE)' for r in pre)
  undo+="DO $data$ BEGIN IF EXISTS(SELECT 1 FROM public.itinerary_transport_services WHERE "+conditions+") THEN RAISE EXCEPTION 'P5_CHECK_ROLLBACK_BLOCKED_RETAIN_DATA';END IF; END $data$;\n"
  for r in pre:
   f=r['name'].removeprefix('itinerary_transport_services_').removesuffix('_check')
   undo+='ALTER TABLE public.itinerary_transport_services DROP CONSTRAINT '+r['name']+';\nALTER TABLE public.itinerary_transport_services ADD CONSTRAINT '+r['name']+' CHECK (char_length('+f+') BETWEEN 1 AND '+str(FIELDS[f])+" AND btrim("+f+") <> '');\n"
  (BASE/'checks-rollback.sql').write_text(undo+'COMMIT;\n')
if __name__=='__main__':build()
