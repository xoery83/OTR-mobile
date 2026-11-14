"""Launch the existing fresh OTP/own-session helper only after Root verifies a NEW finite-access approval."""
import datetime as dt, hashlib, json, os, subprocess, sys, uuid
from pathlib import Path

ROOT = Path('/Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical')
ENTRY = Path(__file__).with_name('normal-control.mts')
WINDOW = 'c2d7c9bc03cb413ca7d082ccf8338f0c'
CLIENT = '83504d3f-59d4-43fd-99b1-bebc54c40f7d'
ACCOUNT = '1f3d7935-1bdc-4952-8d7f-0f72077368c1'
THREAD = '01a18663-48af-7b80-9fac-408bfa98e2fb'
PINS = {
    str(ENTRY): '7893b5ab1d667312d77eb2be22e4cd66557df0f955554453aaa7821099abe3b7',
    str(ROOT/'src/data/api/requestBoundary.ts'): '9d410399104b6d97188d25de60733d438b5ea3583c7b79ca7c017bb46f0209be',
    str(ROOT/'scripts/auth/registered-qa-host-session.ts'): 'a8b9b8e264270f4ddf84dbf65e2cdf7365f61efa3c0d69c6989a4af8422f055d',
    str(ROOT/'scripts/auth/resend-inbound-otp-e2e.ts'): 'd85a134817d827caf34461f01050e0ebb50edc9357f66b7d1554b4bd38951358',
    str(ROOT/'scripts/auth/mcp-oauth-qa-checks.ts'): '1e6fc65133201b7d2c7660b0f772e1d6232207929efeecb3fb0b920e39667402',
}
sha = lambda b: hashlib.sha256(b).hexdigest()

def validate_actual_owner(b, raw):
    assert b['approvedExecutionGateSHA256'] == '054c1b313ee744c08cdaf406068c484b6ce5aa566a8f5d78a6d7a024754ebfe2'
    assert b['actualOwnerSourceThreadId'] == '01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'
    message = b['actualOwnerSourceMessageId']
    assert str(uuid.UUID(message)) == message and message != '01a1a4d2-866f-7391-82b3-24d63fe83347'
    assert b['rootSourceReadbackVerified'] is True
    assert hashlib.sha256(raw).hexdigest() == b['actualOwnerWireSHA256']
    wire = json.loads(raw)
    assert wire['sourceThreadId'] == b['actualOwnerSourceThreadId'] and wire['messageId'] == message
    assert wire['role'] == 'user' and wire['sourceKind'] == 'DIRECT_HUMAN_REPLY'
    assert isinstance(wire['text'], str) and 0 < len(wire['text'].strip()) <= 20000
    assert wire['gateSHA256'] == b['approvedExecutionGateSHA256']
    assert wire['phase'] == 'CREATE' and wire['explicitUnknownReplayApproval'] is True
    expected = {'actorAccountId': '1f3d7935-1bdc-4952-8d7f-0f72077368c1', 'tripId': 'cc44a705-6f43-41e0-a2f9-16f334b2a6b2', 'operationId': 'a8c1e142-19c4-4d53-9d8e-fae4ad3ff616', 'targetItemId': 'a9dbe020-ebce-49fb-ab31-859977f328c6', 'commandSHA256': 'aa79e67f8295d3366d49b167269256835dd21110b2f6036d5b909467f1a00e35', 'intentSHA256': 'e3775ca551760c823ead8f8bfe158a958260d827f7dc6737c7a13c4215fbe1db', 'previewDigest': '58c72759ffa84e8100d510e5d42a744195d8a04c9478980f3c031cdfdc59f4dc'}
    assert all(wire[k] == v for k, v in expected.items())



def validate_binding(gate, b):
    assert len(gate)==64 and all(c in '0123456789abcdef' for c in gate) and gate!='0'*64
    assert gate not in ('fe7508f4611c166b8f3935253517accf8bfdda7e50ab5705d09abbc0e1f54cd4', '58638943af2139e76c31777065ed5663625eec35f66e85d57967dbc7073c0e1b')
    assert b['status']=='ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED'
    assert b['approvedExecutionGateSHA256']==gate and b['ownerAccessApproved'] is True
    assert b['sourceThreadId']==THREAD and b['sourceMessageId'] and b['rootSourceReadbackVerified'] is True
    assert b['windowId']==WINDOW and b['accountId']==ACCOUNT and b['clientId']==CLIENT
    assert b['freshConsumerUIReady'] is True and b['resourceReadyNoConflict'] is True
    assert b['dcrDisabledVerified'] is True and b['timersAndIssuerCloseQualified'] is True
    assert b['closeUnchangedDefaultProbe']=='PASS'

def main():
    binding_path=Path(sys.argv[1]);gate=sys.argv[2];b=json.loads(binding_path.read_text())
    validate_binding(gate,b)
    assert sha(Path(b['gatePath']).read_bytes())==gate
    validate_actual_owner(b, Path(b['actualOwnerWirePath']).read_bytes())
    for name,expected in PINS.items():assert sha(Path(name).read_bytes())==expected
    public={};keys={'EXPO_PUBLIC_OTR_DEV_SUPABASE_URL','EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY'}
    for line in Path('/Users/xoery/Project/otr-mobile/.env.local').read_text().splitlines():
        k,sep,v=line.partition('=');k=k.strip()
        if sep and k in keys:public[k]=v.strip().strip("\"'")
    assert set(public)==keys and public['EXPO_PUBLIC_OTR_DEV_SUPABASE_URL']=='https://tuqigdxrvrerfewsxqgm.supabase.co'
    assert public['EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY'].startswith('sb_publishable_')
    run=Path('/private/tmp/otr-mcp-c02-access-'+WINDOW);run.mkdir(mode=0o700,exist_ok=True)
    assert not run.is_symlink() and run.stat().st_mode&0o077==0
    start=dt.datetime.now(dt.timezone.utc)
    with (run/'CONTROL_LAUNCH.json').open('x') as f:
        json.dump({'startedAt':start.isoformat(),'maximumControlMinutes':35,'windowClockStarted':False,
                   'accountId':ACCOUNT,'clientId':CLIENT,'gateSHA256':gate,'secretsRecorded':False},f)
    (run/'CONTROL_LAUNCH.json').chmod(0o600)
    env={**os.environ,**public,'DO_NOT_TRACK':'1','OTR_DEV_OTP_TEST':'1','OTR_QA_RESEND_SCOPE':'dedicated-qa-team','OTR_QA_DEV_BUSINESS_WINDOW':'HELD'}
    result=subprocess.run(['node','--import','tsx',str(ENTRY),'/private/tmp/otr-auth-consumer-control-c02-'+WINDOW,CLIENT],cwd=ROOT,env=env)
    raise SystemExit(result.returncode)

if __name__=='__main__':main()
