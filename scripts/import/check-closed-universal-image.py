#!/usr/bin/env python3
"""Owned local network-none candidate smoke only. Never deploys/activates a Gate."""
import argparse, hashlib, json, re, subprocess, time, uuid
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();m=json.loads(a.manifest.read_text());image=m['imageId']
assert re.fullmatch(r'sha256:[0-9a-f]{64}',image)
name='otr-universal-closed-'+uuid.uuid4().hex[:12]
def call(*args):return subprocess.check_output(['docker',*args],text=True,stderr=subprocess.PIPE).strip()
created=False
try:
    info=json.loads(call('image','inspect',image))[0]
    assert info['Id']==image and info['Config']['User']=='otr'
    call('run','-d','--name',name,'--platform','linux/amd64','--network','none','--read-only',
         '-e','OTR_DEV_BACKEND_NETWORK_MODE=host','-e','OTR_DEV_BACKEND_BIND_ADDRESS=127.0.0.1',
         '-e','OTR_DEV_SUPABASE_URL=https://tuqigdxrvrerfewsxqgm.supabase.co',
         '-e','OTR_DEV_SUPABASE_PUBLISHABLE_KEY=synthetic-fixture-only',
         '-e','OTR_DEV_SUPABASE_SECRET_KEY=synthetic-fixture-only',image,'node','server-capture.mjs');created=True
    js="""const id='11111111-1111-4111-8111-111111111111';const h=await fetch('http://127.0.0.1:8787/health');const health=await h.json();const routes={};for(const [path,method] of [['/v2/trips/'+id+'/metadata','GET'],['/v2/trips/'+id+'/ledger/bootstrap','GET'],['/v2/trips/'+id+'/universal-source-originals/acquire','POST'],['/v2/import-batches/'+id+'/interpretations?tripId='+id,'GET']]){const r=await fetch('http://127.0.0.1:8787'+path,{method,headers:{'Content-Type':'application/json','OTR-Trip-Metadata-Version':'3'},...(method==='POST'?{body:'{}'}:{})});routes[path]=r.status;}console.log(JSON.stringify({health,status:h.status,routes,uid:process.getuid()}));"""
    for _ in range(15):
        try:r=json.loads(call('exec',name,'node','--input-type=module','-e',js));break
        except subprocess.CalledProcessError:time.sleep(.5)
    else:raise RuntimeError('LOCAL_HEALTH_UNAVAILABLE')
    assert r['status']==200 and r['health']['environment']=='development' and r['health']['status']=='ok',r
    assert all(s==401 for s in r['routes'].values()),r
    assert r['uid']==10001
    for filename,expected in m['bundles'].items():
        actual=subprocess.check_output(['docker','exec',name,'cat','/app/'+filename])
        assert hashlib.sha256(actual).hexdigest()==expected
    operator=json.loads(call('exec',name,'node','universal-prepare.mjs','--recover-only'))
    assert operator=={'status':'CLOSED'}
    r.update({'status':'LOCAL_CLOSED_IMAGE_PASS','sourceHead':m['sourceHead'],'imageId':image,'bundles':m['bundles'],'network':'none','rootFilesystem':'read-only','runtimeMounts':0,'operator':operator,'hostedWrites':0,'providerCalls':0})
    a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
finally:
    if created:call('rm','-f',name)
