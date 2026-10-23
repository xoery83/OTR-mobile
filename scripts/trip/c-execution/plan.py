"""Local manifest materialization only. No SSH/SQL/Auth. Does not authorize execution."""
import argparse, json, pathlib
from control import digest, load_plan, private_write, PROJECT, IMAGE, BUNDLE, PAYLOADS

def main():
 a=argparse.ArgumentParser();a.add_argument('approved_template');a.add_argument('provision_receipts');a.add_argument('current_b_baseline');a.add_argument('output');v=a.parse_args()
 p=json.loads(pathlib.Path(v.approved_template).read_text());r=json.loads(pathlib.Path(v.provision_receipts).read_text());b=json.loads(pathlib.Path(v.current_b_baseline).read_text())
 assert r['status']=='TWO_NEW_SYNTHETIC_AUTH_CREATED_NORMAL_LOGIN_STILL_REQUIRED' and r['attempts']==2
 # Exact new administrative response IDs become the finite target; never select existing users.
 p['actorIds']={label:r['receipts'][label]['id'] for label in ('A','B')}
 assert all(r['receipts'][k]['newlyCreated'] is True and r['receipts'][k]['project']==PROJECT and r['receipts'][k]['email']==f'otr-meta-qa-20261022-01-{k.lower()}@example.invalid' for k in ('A','B'))
 assert p['project']==PROJECT and p['image']==IMAGE and p['bundle']==BUNDLE
 p['baseline']=b;p['bodyHashes']={'create':PAYLOADS['create']['sha256Utf8'],'metadata':PAYLOADS['editProposal']['sha256Utf8'],'preview':PAYLOADS['currencyPreview']['sha256Utf8']}
 here=pathlib.Path(__file__).resolve().parent
 import hashlib
 p['databaseCA']=(here/'supabase-prod-ca-2021.crt').read_text()
 assert hashlib.sha256(p['databaseCA'].encode()).hexdigest()=='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
 p['serviceHelperSHA256']=hashlib.sha256((here/'service.py').read_bytes()).hexdigest();p['controlSHA256']=hashlib.sha256((here/'control.py').read_bytes()).hexdigest();p['controlPath']=str(here/'control.py')
 p['windowId']=digest({k:p[k] for k in ['project','image','bundle','actorIds','startsAt','expiresAt','bodyHashes']})
 p.pop('manifestSHA256',None);p['manifestSHA256']=digest(p)
 private_write(v.output,p);load_plan(v.output)
 print(json.dumps({'status':'LOCAL_MANIFEST_PREPARED_NOT_EXECUTED','manifestSHA256':p['manifestSHA256'],'windowId':p['windowId']}))
if __name__=='__main__':main()
