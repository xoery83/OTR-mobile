"""Prepare a narrow adaptation of existing Root CAS/plan ports. Pure local source generation only."""
import hashlib,json
from pathlib import Path
SRC=Path('/private/tmp/otr-mcp-chatgpt-751df5929be940f7b18e4f55e584692c-20261102/operators')
OUT=Path('/private/tmp/otr-mcp-c02-s1-package-20261103/operators')
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads(Path('/private/tmp/otr-mcp-c02-s1-package-20261103/BUILD_MANIFEST.json').read_text())
text=(SRC/'config_cas.py').read_text(); start=text.index('def validate_config(');end=text.index('\ndef atomic_private',start)
validator='''def validate_config(raw, profile, started, phase, approval=None, now=None):
    now = int(time.time() * 1000) if now is None else now
    q=json.loads(raw);p=q['plan']
    assert profile=='ChatGPT' and phase in ('EMPTY','CREATE','EDIT')
    assert p['startsAt']==started and started<=now<p['normalCloseAt']==p['expiresAt']-120000
    assert 0<p['expiresAt']-started<=1800000 and len(p['gateSHA256'])==64 and p['gateSHA256']!='0'*64
    assert str(uuid.UUID(p['windowId']))==p['windowId']
    if phase=='EMPTY':assert p['command'] is None and q['confirmations']==[] and approval is None
    else:
        assert len(q['confirmations'])==1 and p['command']['command']==('CREATE_ITEM' if phase=='CREATE' else 'SET_ITEM_SCHEDULE')
        c=q['confirmations'][0]
        assert isinstance(approval,dict) and approval.get('ownerConfirmed') is True
        assert approval.get('approvedExecutionGateSHA256')==p['gateSHA256']
        assert approval.get('sourceThreadId')==c['sourceThreadId']=='01a18663-48af-7b80-9fac-408bfa98e2fb'
        assert approval.get('sourceMessageId')==c['sourceMessageId'] and approval.get('sourceEvidenceSHA256')==c['sourceEvidenceSHA256']
        assert approval.get('operationId')==c['operationId']==p['command']['operationId'] and approval.get('previewDigest')==c['previewDigest']
    return dict(q,expiresAt=p['expiresAt'])

def same_window(old,new,phase):
    assert {k:v for k,v in old['plan'].items() if k not in ('command','createdOperationId')}=={k:v for k,v in new['plan'].items() if k not in ('command','createdOperationId')}
    if phase=='CREATE':assert old['plan']['command'] is None and old['confirmations']==[]
    else:
        assert old['plan']['command']['command']=='CREATE_ITEM' and len(old['confirmations'])==1
        assert new['plan']['createdOperationId']==old['plan']['command']['operationId']
        assert new['plan']['command']['target']==old['plan']['command']['target']
'''
text=text[:start]+validator+text[end:]
text=text.replace("WRITE = 'OTR_DEV_MCP_WRITE_QA_CONFIG'","WRITE = 'OTR_DEV_MCP_C02_QA_CONFIG'")
text=text.replace("'gateSHA256': GATE, 'windowId': g['windowId']","'gateSHA256': g['gateSHA256'], 'windowId': g['windowId']")
text=text.replace("'currentContainerId': current_id,", "'currentContainerId': current_id, 'defaultContainerId': g['defaultContainerId'], 'defaultConfigSHA256': g['restoreBaseline']['beforeConfigSHA256'],")
text=text.replace("g['gateSHA256'] == GATE","len(g['gateSHA256'])==64 and g['gateSHA256']!='0'*64")
text=text.replace("'otr-mcp-slice1-' + g['phase'].lower()","'otr-mcp-c02-' + g['phase'].lower()")
text=text.replace("else 'otr-mcp-slice1-empty-' + g['windowId']","else 'otr-mcp-c02-'+('empty' if g['phase']=='CREATE' else 'create')+'-'+g['windowId']")
text=text.replace("if g['phase'] == 'CONFIRM':","if g['phase'] != 'EMPTY':")
text=text.replace("directory / 'owner-approval.json'","directory / ('owner-approval-'+g['phase'].lower()+'.json')")
needle="    assert q['expiresAt'] == g['deadlineMs']"
insert="""    assert q['plan']['gateSHA256']==g['gateSHA256'] and uuid.UUID(q['plan']['windowId']).hex==g['windowId']
    access_raw=private(directory/'access-approval.json');assert hashlib.sha256(access_raw).hexdigest()==g['accessApprovalSHA256']
    access=json.loads(access_raw)
    assert access['status']=='ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED' and access['rootSourceReadbackVerified'] is True
    assert access['approvedExecutionGateSHA256']==g['gateSHA256'] and access['windowId']==g['windowId'] and access['ownerAccessApproved'] is True
    assert access['sourceThreadId']=='01a18663-48af-7b80-9fac-408bfa98e2fb' and access['sourceMessageId']
    binary=directory/'c02-host.mjs';s=binary.lstat()
    assert stat.S_ISREG(s.st_mode) and not binary.is_symlink() and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=8388608
    assert hashlib.sha256(binary.read_bytes()).hexdigest()==C02_HOST_SHA
    import subprocess
    assert hashlib.sha256(subprocess_bytes(g['beforeContainerId'], 'mcp/c02-host.mjs')).hexdigest()==C02_HOST_SHA
    subprocess.run(['docker','exec','-i',g['beforeContainerId'],'node','--input-type=module','-e',"import fs from 'node:fs';const m=await import(process.argv[1]);m.c02HostConfig.parse(JSON.parse(fs.readFileSync(0,'utf8')));",'file:///app/mcp/c02-host.mjs'],input=g['authQaConfig'],text=True,capture_output=True,check=True,timeout=15)
"""
assert text.count(needle)==1;text=text.replace(needle,insert+needle)
text=text.replace("and READ not in e","and READ not in e and 'OTR_DEV_MCP_WRITE_QA_CONFIG' not in e")
old="""            before = validate_config(e[WRITE], g['clientProfile'], g['windowStartedAtMs'], 'EMPTY')
            assert {k:v for k,v in before.items() if k != 'confirmations'} == {k:v for k,v in q.items() if k != 'confirmations'}"""
assert old in text;text=text.replace(old,"            same_window(json.loads(e[WRITE]),q,g['phase'])")
text=text.replace("'auth-consent/app.js')","'auth-consent/app.js', 'mcp/c02-host.mjs')")
text=text.replace("('empty-cas.json', 'confirm-cas.json')","('empty-cas.json', 'create-cas.json', 'edit-cas.json')")
text=text.replace("from pathlib import Path\n","from pathlib import Path\nC02_HOST_SHA = "+repr(manifest['candidateHostSHA256'])+"\n")
timer_raw=Path('scripts/mcp/c02-timers.py').read_bytes()
close_raw=Path('scripts/mcp/c02-close.py').read_bytes()
assert sha(close_raw) in timer_raw.decode(), 'TIMER_CLOSE_PIN_STALE'
close_target=OUT.parent/'c02-close.py';close_target.write_bytes(close_raw);close_target.chmod(0o600)
timer_guard='''def require_c02_timers(g, directory):
    import importlib.util
    source=directory/'c02-timers.py'
    assert hashlib.sha256(private(source)).hexdigest()==C02_TIMERS_SHA
    spec=importlib.util.spec_from_file_location('pinned_c02_timers',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.require_before_serve(g,directory,private,int(time.time()*1000))

'''
text=text.replace('def run(g, directory):',timer_guard+'def run(g, directory):')
text=text.replace('C02_HOST_SHA = ', 'C02_TIMERS_SHA = '+repr(sha(timer_raw))+'\nC02_HOST_SHA = ',1)
needle="""            changed = True
            call(['docker','stop'"""
assert text.count(needle)==1
text=text.replace(needle,"""            require_c02_timers(g, directory)
            changed = True
            call(['docker','stop'""")
Path('/private/tmp/otr-mcp-c02-s1-package-20261103/c02-timers.py').write_bytes(timer_raw)
Path('/private/tmp/otr-mcp-c02-s1-package-20261103/c02-timers.py').chmod(0o600)
OUT.mkdir(mode=0o700,exist_ok=True);(OUT/'config_cas.py').write_text(text)
plan=(SRC/'prepare_cas.py').read_text().replace("request['gateSHA256'] == GATE and request['phase'] in ('EMPTY', 'CONFIRM')","request['gateSHA256'] != '0'*64 and request['phase'] in ('EMPTY', 'CREATE', 'EDIT')")
plan=plan.replace('validate_config, same_host','validate_config, same_host, same_window')
plan=plan.replace("    window = request['windowId']","    assert q['plan']['gateSHA256']==request['gateSHA256']\n    window = request['windowId']")
old="""        old = validate_config(e[WRITE], request['clientProfile'], request['windowStartedAtMs'], 'EMPTY', now=now)
        assert {k:v for k,v in old.items() if k != 'confirmations'} == {k:v for k,v in q.items() if k != 'confirmations'}"""
assert old in plan;plan=plan.replace(old,"        same_window(__import__('json').loads(e[WRITE]),q,request['phase'])")
plan=plan.replace("'gateSHA256':GATE","'gateSHA256':request['gateSHA256'], 'accessApprovalSHA256':request['accessApprovalSHA256']")
plan=plan.replace("'otr-mcp-slice1-'+request['phase'].lower()","'otr-mcp-c02-'+request['phase'].lower()")
plan=plan.replace("else 'otr-mcp-slice1-empty-'+window","else 'otr-mcp-c02-'+('empty' if request['phase']=='CREATE' else 'create')+'-'+window")
plan=plan.replace("if request['phase'] == 'CONFIRM':","if request['phase'] != 'EMPTY':")
(OUT/'prepare_cas.py').write_text(plan)
for p in [OUT/'config_cas.py',OUT/'prepare_cas.py']:p.chmod(0o600);compile(p.read_text(),str(p),'exec')
result={'status':'EXISTING_CAS_PORT_NARROW_C02_CANDIDATE_NOT_EXECUTED','original':{n:sha((SRC/n).read_bytes()) for n in ['config_cas.py','prepare_cas.py']},'candidate':{n:sha((OUT/n).read_bytes()) for n in ['config_cas.py','prepare_cas.py']},'boundHostSHA256':manifest['candidateHostSHA256'],'preserved':'Existing lock/CAS/EnvHash/Host/mount/file/bundle/rollback/pointer-before-serve logic; no Env or credentials copied to plans.','changes':'Only C02 config key/schema, actual new Owner Gate/source binding, EMPTY→CREATE→EDIT same-window, extra pinned Host bundle.','protectedActionsExecuted':0}
result['timerLauncherSHA256']=sha(timer_raw)
result['closeWrapperSHA256']=sha(close_raw)
result['timerGuard']='Pinned launcher verifies both exact absolute timer units after pointer publication and before any default stop; failure restores default pointer without serving candidate.'
Path('docs/mcp/c02/s1/CAS_PORT_CANDIDATE.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
