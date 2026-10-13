"""New local real Storage API fixture only. Never imports credentials or pulls images."""
import base64
import hashlib
import hmac
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGES = {
 'supabase/postgres:17.6.1.167': 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb',
 'public.ecr.aws/supabase/storage-api:v1.73.1': 'sha256:c24fb33cc2fa38d0f9582a30312907fc56da333fb9ba0646833186197e4982f3',
}


def run(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('LOCAL_DOCKER_FAILURE: '+args[0])
    return result.stdout.strip()


def main():
    if not __debug__:
        raise RuntimeError('VERIFICATION_REQUIRES_ASSERTIONS')
    if len(sys.argv) != 2:
        raise SystemExit('usage: python3 scripts/provider/flight-pdf-provider-local.py /absolute/local/evidence.json')
    output = Path(sys.argv[1])
    if not output.is_absolute() or output.exists():
        raise RuntimeError('NEW_ABSOLUTE_LOCAL_EVIDENCE_PATH_REQUIRED')
    for image, expected in IMAGES.items():
        if run('image','inspect','--format','{{.Id}}',image) != expected:
            raise RuntimeError('LOCAL_IMAGE_DRIFT_OR_MISSING')
    prefix='otr-pdf-provider-'+uuid.uuid4().hex[:12]
    network=prefix+'-net';pg=prefix+'-pg';storage=prefix+'-storage'
    created=[];network_created=False
    secret='synthetic-only-'+uuid.uuid4().hex
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
    def token(role):
        body=encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+3600})
        return body+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')
    try:
        run('network','create','--opt','com.docker.network.bridge.enable_ip_masquerade=false',network);network_created=True
        run('run','--name',pg,'--network',network,'--network-alias','db','-e','POSTGRES_PASSWORD=synthetic-provider-only','-d',next(iter(IMAGES)));created.append(pg)
        for _ in range(80):
            probe=subprocess.run(['docker','exec',pg,'psql','-U','supabase_admin','-d','postgres','-At','-c',"select exists(select 1 from pg_roles where rolname='supabase_storage_admin');"],capture_output=True,text=True)
            tcp=subprocess.run(['docker','exec',pg,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
            if tcp.returncode == 0 and probe.returncode == 0 and probe.stdout.strip() == 't':break
            time.sleep(.2)
        else:raise RuntimeError('LOCAL_PG_NOT_READY')
        run('exec',pg,'psql','-U','supabase_admin','-d','postgres','-c',"ALTER ROLE supabase_storage_admin LOGIN PASSWORD 'synthetic-provider-only';")
        env={'DATABASE_URL':'postgresql://supabase_storage_admin:synthetic-provider-only@db:5432/postgres','AUTH_JWT_SECRET':secret,'SERVICE_KEY':token('service_role'),'ANON_KEY':token('anon'),'STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage','TENANT_ID':'otr-disposable-provider','REGION':'local','GLOBAL_S3_BUCKET':'local-backing','FILE_SIZE_LIMIT':'65536','UPLOAD_FILE_SIZE_LIMIT_STANDARD':'65536','TUS_URL_PATH':'/upload/resumable','DB_MIGRATIONS_STRATEGY':'startup','PG_QUEUE_ENABLE':'false','ENABLE_IMAGE_TRANSFORMATION':'false','LOG_LEVEL':'error','SERVER_PORT':'5000'}
        args=['run','--name',storage,'--network',network,'-p','127.0.0.1::5000','--tmpfs','/var/lib/storage:rw,size=16777216','-d']
        for key,value in env.items():args+=['-e',key+'='+value]
        args += [list(IMAGES)[1]];run(*args);created.append(storage)
        for _ in range(30):
            ports=run('inspect','--format','{{json .NetworkSettings.Ports}}',storage)
            mapping=json.loads(ports).get('5000/tcp')
            if mapping:break
            time.sleep(.1)
        else:raise RuntimeError('LOCAL_STORAGE_PORT_NOT_READY')
        assert mapping[0]['HostIp']=='127.0.0.1'
        origin='http://127.0.0.1:'+mapping[0]['HostPort']
        with tempfile.TemporaryDirectory(prefix='otr-provider-credentials-') as private:
            file=Path(private)/'environment.json'
            file.write_text(json.dumps({'origin':origin,'token':env['SERVICE_KEY'],'anon':env['ANON_KEY'],'pg':pg}));file.chmod(0o600)
            subprocess.run(['node',str(ROOT/'backend/src/__fixtures__/sourcePdfBackendLocal.mjs'),str(file),str(output)],cwd=ROOT,check=True,timeout=90)
        value=json.loads(output.read_text());value['imagePins']=IMAGES;value['environment']={'namespace':prefix,'loopbackOnly':True,'outboundMasquerade':False,'queueEnabled':False,'backend':'FILE_TMPFS','nodeHostVersion':subprocess.check_output(['node','--version'],text=True).strip()}
        output.write_text(json.dumps(value,indent=2)+'\n')
    finally:
        for name in reversed(created):run('rm','-fv',name)
        if network_created:run('network','rm',network)


if __name__ == '__main__':
    main()
