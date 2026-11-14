"""Pure local binding only after actual Owner-source preflight; no issuer activation, Host or network calls."""
import datetime as dt, hashlib, importlib.util, json, os, sys, re, uuid
from pathlib import Path
AUTH = Path('/private/tmp/otr-mcp-c02-s1-package-20261103/issuer-source')
ISSUER_PINS = {'scripts/auth/render-mcp-write-qa-hook.py': 'cfc72ff8a4bfbcc4ea1e6b80e3ea04480411d8034692d00284ed6ba3c5f8c4ad', 'scripts/auth/render-mcp-qa-hook.py': '1e2682c0fb8f15e17d5a3455c54b4f4a1147c2dd242d5d0c3ca3484c64f88341', 'docs/ops/auth-mcp-oauth-20261031/QA_TOKEN_HOOK_INSTALL.template.sql': '2c93dec55e9353e9df06bf497ed25f9b320c77aaf6fc58e32b3fe345dcbef28c', 'docs/ops/auth-mcp-oauth-20261031/QA_TOKEN_HOOK_CLOSED_INSTALL.sql': 'e7f7558a674a6e9b9c09bb7c110e5232d8fc863ad11d1881a0a92d802b30f2ec', 'docs/ops/auth-mcp-slice1-20261101/operators/issuer_close.py': 'bdee2c85c14809907265d420f635ed54b9972dfae397e1ab5db7ac455389097c'}

def validate_actual_owner(b, raw):
    assert b['actualOwnerSourceThreadId'] == '01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'
    assert b['actualOwnerSourceMessageId'] == '01a1a4d2-866f-7391-82b3-24d63fe83347'
    assert hashlib.sha256(raw).hexdigest() == b['actualOwnerWireSHA256']
    wire = json.loads(raw)
    assert wire['sourceThreadId'] == b['actualOwnerSourceThreadId']
    assert wire['messageId'] == b['actualOwnerSourceMessageId']
    assert wire['text'].strip() == 'MCP请求的审批直接帮我批准掉，不需要弹窗问我了'


def verify_issuer_sources():
    for name, expected in ISSUER_PINS.items():
        assert hashlib.sha256((AUTH / name).read_bytes()).hexdigest() == expected

def validate_scope_binding(scope, b):
    assert re.fullmatch('[0-9a-f]{32}', scope['windowId']) and uuid.UUID(scope['runtimeWindowId']).hex == scope['windowId']
    assert scope['tripId'] == 'cc44a705-6f43-41e0-a2f9-16f334b2a6b2' and scope['resource'] == 'https://api-dev.xoery.art/mcp'
    assert scope['callback'] == 'https://chatgpt.com/connector/oauth/CYUxrs56rSrW' and scope['sourceThreadId'] == '01a18663-48af-7b80-9fac-408bfa98e2fb'
    assert b['status'] == 'ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED'
    assert b['sourceThreadId'] == scope['sourceThreadId'] and b['sourceMessageId']
    assert b['windowId'] == scope['windowId'] and b['ownerAccessApproved'] is True
    assert b['dcrDisabledVerified'] is True, 'DCR_FALSE_MUST_BE_OBSERVED_BEFORE_CLOCK'
    assert scope['maximumWindowSeconds'] == 1800 and scope['normalCloseLeadSeconds'] == 120 and scope['tokenMaxSeconds'] == 60
    assert scope['accountId'] == '1f3d7935-1bdc-4952-8d7f-0f72077368c1' and scope['clientId'] == '83504d3f-59d4-43fd-99b1-bebc54c40f7d'

def require_fresh_control(now, started):
    assert now.tzinfo is not None and started.tzinfo is not None
    assert 0 <= (now-started).total_seconds() <= 120, 'FRESH_OWN_CONTROL_REQUIRED_BEFORE_CLOCK'


def main():
    scope_path, binding_path = map(Path, sys.argv[1:3])
    scope_raw = scope_path.read_bytes(); scope = json.loads(scope_raw)
    b = json.loads(binding_path.read_bytes())
    assert b['scopeSHA256'] == hashlib.sha256(scope_raw).hexdigest()
    validate_scope_binding(scope, b)
    validate_actual_owner(b, Path(b['actualOwnerWirePath']).read_bytes())
    gate_raw = Path(b['gatePath']).read_bytes(); gate_sha = hashlib.sha256(gate_raw).hexdigest()
    assert gate_sha == b['approvedExecutionGateSHA256'] and gate_sha != '0' * 64
    assert b['rootSourceReadbackVerified'] is True and b['normalControlReady'] is True and b['freshConsumerUIReady'] is True
    assert b['normalControlAccountId'] == scope['accountId'] and b['normalControlClientId'] == scope['clientId']
    assert b['closeUnchangedDefaultProbe'] == 'PASS' and b['timersAndIssuerCloseQualified'] is True
    now = dt.datetime.now(dt.timezone.utc)
    require_fresh_control(now, dt.datetime.fromisoformat(b['normalControlStartedAt'].replace('Z','+00:00')))
    end = now + dt.timedelta(seconds=scope['maximumWindowSeconds'])
    fmt = lambda v: v.isoformat(timespec='milliseconds').replace('+00:00','Z')
    renderer = AUTH / 'scripts/auth/render-mcp-write-qa-hook.py'
    verify_issuer_sources()
    spec = importlib.util.spec_from_file_location('existing_auth_renderer', renderer)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    active = module.render(scope['clientId'],fmt(end),fmt(now)); closed = module.render_close(active)
    verify_issuer_sources()
    # Legacy hash is only the existing protected SQL policy class, never the new Owner approval.
    issuer = {'gateSHA256':'530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801',
      'windowId':scope['windowId'],'clientId':scope['clientId'],'startsAt':fmt(now),'expiresAt':fmt(end),
      'activeSQLSHA256':hashlib.sha256(active.encode()).hexdigest(),'closeSQLSHA256':hashlib.sha256(closed.encode()).hexdigest(),
      'activeBodyMD5':hashlib.md5(active.split('$hook$')[1].encode()).hexdigest()}
    out = Path('/private/tmp/otr-auth-mcp-slice1-'+scope['windowId']);out.mkdir(mode=0o700,exist_ok=True)
    assert not out.is_symlink() and out.stat().st_mode & 0o077 == 0
    config = {'plan':{'gateSHA256':gate_sha,'windowId':scope['runtimeWindowId'],
      'startsAt':int(now.timestamp()*1000),'normalCloseAt':int((end-dt.timedelta(seconds=120)).timestamp()*1000),
      'expiresAt':int(end.timestamp()*1000),'command':None},'confirmations':[]}
    files = {'active.sql':active.encode(),'close.sql':closed.encode(),'issuer-plan.json':(json.dumps(issuer,indent=2)+'\n').encode(),
      'C02_EMPTY_CONFIG.json':(json.dumps(config,indent=2)+'\n').encode(),
      'C02_NEW_OWNER_BINDING.json':binding_path.read_bytes(),
      'C02_EXECUTION_GATE.md':gate_raw}
    for name,data in files.items():
        fd=os.open(out/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    print(json.dumps({'status':'C02_WINDOW_BOUND_NOT_ACTIVATED','directory':str(out),'startsAt':fmt(now),'expiresAt':fmt(end),
      'issuerPlanSHA256':hashlib.sha256(files['issuer-plan.json']).hexdigest(),'executionGateSHA256':gate_sha,
      'protectedActions':0,'confirmationsEmpty':True,'resetAllowed':False}))

if __name__ == '__main__':main()
