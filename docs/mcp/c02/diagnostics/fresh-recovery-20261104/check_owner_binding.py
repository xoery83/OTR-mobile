"""Offline trust-boundary negatives; imports no helper IO or credentials."""
import ast,hashlib,json
from pathlib import Path
root=Path('/private/tmp/otr-mcp-c02-recovery-b0b7c1c04f18432eb255112f5449c5c0')
wire={'sourceThreadId':'01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232','messageId':'01a1a4d2-866f-7391-82b3-24d63fe83347','text':'MCP请求的审批直接帮我批准掉，不需要弹窗问我了'}
raw=json.dumps(wire,ensure_ascii=False).encode();base={'sourceThreadId':'01a18663-48af-7b80-9fac-408bfa98e2fb','actualOwnerSourceThreadId':wire['sourceThreadId'],'actualOwnerSourceMessageId':wire['messageId'],'actualOwnerWireSHA256':hashlib.sha256(raw).hexdigest()}
count=0
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
    tree=ast.parse((root/name).read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner');scope={'hashlib':hashlib,'json':json};exec(compile(ast.Module(body=[fn],type_ignores=[]),name,'exec'),scope);check=scope['validate_actual_owner'];check(base,raw);count+=1
    cases=[(dict(base,actualOwnerSourceThreadId=base['sourceThreadId']),raw),(dict(base,actualOwnerSourceMessageId='wrong'),raw),(dict(base,actualOwnerWireSHA256='0'*64),raw),(base,raw+b' ')]
    for key,value in [('sourceThreadId',base['sourceThreadId']),('messageId','wrong'),('text','other message')]:
        bad=json.dumps(dict(wire,**{key:value}),ensure_ascii=False).encode();cases.append((dict(base,actualOwnerWireSHA256=hashlib.sha256(bad).hexdigest()),bad))
    for binding,payload in cases:
        try:check(binding,payload)
        except (AssertionError,KeyError,ValueError):count+=1
        else:raise AssertionError('UNTRUSTED_OWNER_SOURCE_ACCEPTED:'+name)
    assert 'validate_actual_owner(' in ast.unparse(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('main','run')))
print(f'{count} exact-owner positives/negative cases PASS across all3 helpers; before side-effect call sites present')
