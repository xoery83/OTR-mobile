#!/usr/bin/env python3
"""Offline transformations of private preimages; never connects to a database."""
from pathlib import Path
import argparse, hashlib, json, os
CLAIM_FIXED='15fb16411839879cb85995df484b24f71dacd1d287f491e020fc7a397ad74c97'
sha=lambda b:hashlib.sha256(b).hexdigest()
PREFIX="""
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
  IF public.trip_core_member_write_allowed(TG_TABLE_NAME,TG_OP,to_jsonb(NEW),to_jsonb(OLD)) IS TRUE THEN RETURN NEW;END IF;
 END IF;
"""
def patch(raw,kind):
 text=raw.decode()
 if 'trip_core_member_write_allowed' in text:raise ValueError('ALREADY_PATCHED')
 if kind=='read-state':
  if sha(raw)!=CLAIM_FIXED:raise ValueError('CLAIM_NESTED_FIX_REQUIRED_EXACT_PREIMAGE')
  anchor=" trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;\n"
 elif kind=='write':
  anchor=" if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;\n"
 elif kind=='actor':
  anchor=" return jsonb_build_object('accountId',actor,'tripId',trip,'active',coalesce(is_active,false),'canManageShared',coalesce(owner=actor,false),'personId',self_id,'personIds',case when is_active then known else '[]'::jsonb end);"
  if text.count(anchor)!=1:raise ValueError('ACTOR_SCOPE_DRIFT')
  return text.replace(anchor," if exists(select 1 from public.journey_removed_users where trip_id=trip and user_id=actor) then is_active:=false;self_id:=null;known:='[]'::jsonb;end if;\n"+anchor.replace('coalesce(owner=actor,false)','coalesce(owner=actor and is_active,false)'),1).encode()
 else:raise ValueError('UNKNOWN_PATCH')
 if text.count(anchor)!=1:raise ValueError('GUARD_ANCHOR_DRIFT')
 return text.replace(anchor,anchor+PREFIX,1).encode()
def main():
 p=argparse.ArgumentParser();p.add_argument('--preimage',required=True,type=Path);p.add_argument('--kind',required=True,choices=['actor','write','read-state']);p.add_argument('--expected-sha256',required=True);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
 raw=a.preimage.read_bytes()
 if sha(raw)!=a.expected_sha256:raise ValueError('PREIMAGE_SHA_DRIFT')
 after=patch(raw,a.kind)
 fd=os.open(a.output,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb') as f:f.write(after)
 print(json.dumps({'kind':a.kind,'beforeSHA256':sha(raw),'afterSHA256':sha(after),'privateOutput':str(a.output),'hostedActions':0}))
if __name__=='__main__':main()
