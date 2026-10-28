"""Future approved C read-only B attestation; exports no environment values or runtime content."""
import datetime, hashlib, inspect, json, pathlib, shlex, subprocess, sys
from control import IMAGE, BUNDLE, digest, timestamp

def remote(expected):
 def command(args):return subprocess.check_output(args,text=True,timeout=8)
 s=json.loads(command(['docker','inspect','otr-dev-backend']))[0]
 canonical=lambda v:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 env=dict(v.split('=',1) for v in s['Config']['Env'])
 assert s['Image']==expected['image'] and s['Config']['Cmd']==['node','server-capture.mjs'] and s['Config']['User']=='otr' and s['State'].get('Health',{}).get('Status')=='healthy'
 assert canonical(env)==expected['environmentSHA256'] and canonical(s['HostConfig'])==expected['hostConfigSHA256']
 assert hashlib.sha256(subprocess.check_output(['docker','exec','otr-dev-backend','cat','/app/server-capture.mjs'],timeout=8)).hexdigest()==expected['captureBundleSHA256']
 actual=sorted((m['Source'],m['Destination'],m['RW'])for m in s['Mounts']);assert actual==sorted((m['source'],m['destination'],m['rw'])for m in expected['mounts']) and len(actual)==3
 for f,h in expected['configHashes'].items():assert hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h
 custody=pathlib.Path('/opt/otr/dev-backend/env/capture-custody.json').read_bytes()
 assert hashlib.sha256(custody).hexdigest()==expected['custodySHA256'] and datetime.datetime.fromisoformat(json.loads(custody)['expiresAt'].replace('Z','+00:00'))<=datetime.datetime.now(datetime.timezone.utc)
 assert json.load(urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=4))=={'status':'ok','environment':'development'}
 return dict(expected,hostConfig=s['HostConfig'])

def main():
 p=json.loads(pathlib.Path(sys.argv[1]).read_text());claim=p.pop('manifestSHA256');assert digest(p)==claim and p['ownerAuthorized'] is True and p['project']=='tuqigdxrvrerfewsxqgm'
 now=datetime.datetime.now(datetime.timezone.utc).timestamp();assert timestamp(p['startsAt'])<=now<timestamp(p['expiresAt']) and 0<timestamp(p['expiresAt'])-timestamp(p['startsAt'])<=900
 b=p['expectedBaseline'];assert b['image']==IMAGE and b['captureBundleSHA256']==BUNDLE and b['environmentSHA256']=='cf397ec1ef52c1960f2dfc2a13dd45f4f4a43309d95a3254fe429dde05f9854f' and b['hostConfigSHA256']=='f07262129504a60512ee369db9ac89f3cc666c473f68e7128b4ecfa8c66142e0'
 code='import json,sys,subprocess,hashlib,pathlib,datetime,urllib.request\n'+inspect.getsource(remote)+'\nprint(json.dumps(remote(json.load(sys.stdin))))'
 r=subprocess.run(['ssh','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8','root@178.105.151.143','python3 -c '+shlex.quote(code)],input=json.dumps(b),capture_output=True,text=True,timeout=45)
 assert r.returncode==0;print(json.dumps(json.loads(r.stdout)))
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'status':'BASELINE_NOT_VERIFIED_STOP'}));sys.exit(2)
