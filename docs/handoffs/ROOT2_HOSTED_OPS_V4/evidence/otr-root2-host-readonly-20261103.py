import datetime, hashlib, json, os, pathlib, subprocess

def run(args):
    return subprocess.check_output(args,stderr=subprocess.DEVNULL,timeout=20)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

s=json.loads(run(['docker','inspect','otr-dev-backend']))[0]
e=dict(x.split('=',1) for x in s['Config']['Env'])
assert e['OTR_DEV_SUPABASE_URL']=='https://tuqigdxrvrerfewsxqgm.supabase.co'
r={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'project':'tuqigdxrvrerfewsxqgm','service':'otr-dev-backend','containerId':s['Id'],'image':s['Image'],'running':s['State']['Running'],'health':s['State'].get('Health',{}).get('Status'),'configSHA256':digest(s['Config']),'environmentMapSHA256':digest(e),'hostConfigSHA256':digest(s['HostConfig']),'mountTriplesSHA256':digest(sorted((m['Source'],m['Destination'],m['RW']) for m in s['Mounts'])),'networkMode':s['HostConfig']['NetworkMode'],'user':s['Config']['User'],'readOnlyRootfs':s['HostConfig']['ReadonlyRootfs']}
r['mounts']=[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in s['Mounts']]
r['mountedFileFingerprints']=[]
for m in s['Mounts']:
    p=pathlib.Path(m['Source'])
    if p.is_file():
        b=p.read_bytes();v={'source':str(p),'destination':m['Destination'],'sha256':hashlib.sha256(b).hexdigest(),'uid':p.stat().st_uid,'gid':p.stat().st_gid,'mode':oct(p.stat().st_mode&0o777)}
        if m['Destination']=='/run/otr/universal-png-runtime.json':
            j=json.loads(b);v['enabled']=j.get('enabled');v['expiresAt']=j.get('expiresAt')
        r['mountedFileFingerprints'].append(v)
r['selectorsPresent']={k:k in e for k in ['OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG','OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE','OTR_DEV_MCP_C02_QA_CONFIG','OTR_DEV_MCP_WRITE_QA_CONFIG','OTR_DEV_MCP_READ_QA_CONFIG','OTR_DEV_FLIGHT_ENRICHMENT_HOST']}
r['bundles']={p:hashlib.sha256(run(['docker','exec',s['Id'],'cat',p])).hexdigest() for p in ['/app/server.mjs','/app/server-capture.mjs','/app/mcp/c02-host.mjs','/app/auth-consent/app.js']}
r['healthChecks']={url:run(['curl','-fsS','--max-time','10',url]).decode() for url in ['http://127.0.0.1:8787/health','https://api-dev.xoery.art/health']}
r['listeners8787']=[x for x in run(['ss','-ltn']).decode().splitlines() if ':8787 ' in x]
p=pathlib.Path('/run/lock/otr-universal-finite-service.lock');st=p.stat();key=f'{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino}'
r['lock']={'path':str(p),'uid':st.st_uid,'mode':oct(st.st_mode&0o777),'deviceInode':key,'holders':[x for x in pathlib.Path('/proc/locks').read_text().splitlines() if key in x.split()],'method':'stat and exact device/inode /proc/locks match; no open/flock'}
r['timers']=[x.strip() for x in run(['systemctl','list-units','--type=timer','--all','--no-legend','--no-pager']).decode().splitlines() if 'otr-' in x]
r['workers']={u:run(['systemctl','show',u,'-p','LoadState','-p','MainPID','-p','ActiveState','-p','SubState']).decode().splitlines() for u in ['otr-universal-png-worker.service','otr-universal-pdf-worker.service']}
z=json.loads(run(['docker','inspect','c213f5dd69ef1e8e4f469450a7985ff731b04ada6f514a48c91e2b4008dba682']))[0]
r['rollback']={'containerId':z['Id'],'image':z['Image'],'status':z['State']['Status'],'name':z['Name'],'configSHA256':digest(z['Config'])}
run(['docker','image','inspect',z['Image']]);r['rollback']['imageExists']=True
r['releaseMechanismSHA256']=hashlib.sha256(pathlib.Path('/opt/otr/dev-backend/build/mcp-c02-closed-2b71f8c5/release.py').read_bytes()).hexdigest()
print(json.dumps(r,indent=2))
