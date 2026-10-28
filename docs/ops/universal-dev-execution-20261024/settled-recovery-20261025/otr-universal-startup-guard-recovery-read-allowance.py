"""LOCAL-only proposed amendment. One existing ledger/lock; no read or activation."""
import argparse, hashlib, importlib.util, json, re
from datetime import datetime, timezone
from pathlib import Path
BASE=Path('/private/tmp/otr-universal-settled-recovery-read-allowance.py')
BASE_SHA='880bda710a87a835df3de35378a592321fb234c1f1a2d9be774a4afa0fec877e'
if hashlib.sha256(BASE.read_bytes()).hexdigest()!=BASE_SHA: raise ValueError('BASE_HELPER_DRIFT')
spec=importlib.util.spec_from_file_location('settled_operator_ledger',BASE)
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
legacy=base.legacy
BATCH=base.BATCH
KEY='startupGuardRecoveryReadAmendment'
POLICY='UNIVERSAL_STARTUP_GUARD_RECOVERY'
PURPOSES=base.PURPOSES
UNKNOWN={'startupProcessCount':12,'businessReads':'UNKNOWN','refundedReads':0,'historicalAllowanceRestored':False}
def digest(value): return legacy.digest(json.dumps(value,sort_keys=True,separators=(',',':')).encode())
def metadata(v): return {k:value for k,value in v.items() if k not in {'maximum','reservations',KEY}}
def previous(v):
 rows,a=base.rows_and_original(v);s=v.get(base.KEY,{})
 if len(rows)<43 or s.get('freshBatchId')!=BATCH or s.get('prefixCount')!=42 or s.get('startsAtOrdinal')!=43 or s.get('additionalApprovedReads')!=8 or s.get('previousScopeCap')!=43 or s.get('scopeCap')!=51 or s.get('previousMaximum')!=48 or s.get('maximum')!=56 or s.get('purposes')!=sorted(PURPOSES) or s.get('prefixSHA256')!=digest(rows[:42]) or s.get('originalFreshAmendmentSHA256')!=digest(a): raise ValueError('PREVIOUS_AMENDMENT_OR_PREFIX_DRIFT')
 return rows

def amend(directory,expected_sha,owner_gate_sha,execute=False):
 if not all(isinstance(h,str) and re.fullmatch('[a-f0-9]{64}',h) for h in [expected_sha,owner_gate_sha]): raise ValueError('EXACT_SHA_REQUIRED')
 def action(p):
  raw=p.read_bytes();v=json.loads(raw);rows=previous(v)
  if legacy.digest(raw)!=expected_sha or v.get('maximum')!=56 or len(rows)!=43 or KEY in v: raise ValueError('EXACT_43_MAX56_PREIMAGE_REQUIRED')
  a={'version':1,'freshBatchId':BATCH,'policy':POLICY,'ownerGateSHA256':owner_gate_sha,'previousLedgerSHA256':expected_sha,'prefixCount':43,'prefixSHA256':digest(rows),'previousMetadataSHA256':digest(metadata(v)),'startsAtOrdinal':44,'additionalApprovedReads':16,'hardPolicyCap':16,'finalReservationOrdinal':59,'previousMaximum':56,'maximum':72,'purposes':sorted(PURPOSES),'historicalStartupReadUncertainty':UNKNOWN}
  if execute: v['maximum']=72;v[KEY]=a;legacy.write(p,v)
  return {'status':'LOCAL_STARTUP_GUARD_AMENDMENT_APPLIED' if execute else 'PROPOSED_NO_WRITE','amendment':a}
 return legacy.locked(directory,action)

def reserve(directory,purpose,policy=POLICY):
 if policy!=POLICY or purpose not in PURPOSES: raise ValueError('UNAPPROVED_NEW_POLICY_OR_PURPOSE')
 def action(p):
  v=json.loads(p.read_bytes());rows=previous(v);a=v.get(KEY,{})
  exact={'version':1,'freshBatchId':BATCH,'policy':POLICY,'prefixCount':43,'startsAtOrdinal':44,'additionalApprovedReads':16,'hardPolicyCap':16,'finalReservationOrdinal':59,'previousMaximum':56,'maximum':72,'purposes':sorted(PURPOSES),'historicalStartupReadUncertainty':UNKNOWN}
  if v.get('maximum')!=72 or any(a.get(k)!=value for k,value in exact.items()) or any(not isinstance(a.get(k),str) or not re.fullmatch('[a-f0-9]{64}',a[k]) for k in ['ownerGateSHA256','previousLedgerSHA256']) or a.get('prefixSHA256')!=digest(rows[:43]) or a.get('previousMetadataSHA256')!=digest(metadata(v)): raise ValueError('STARTUP_GUARD_AMENDMENT_OR_PREFIX_DRIFT')
  added=rows[43:]
  if any(r.get('policy')!=POLICY or r.get('freshBatchId')!=BATCH or r.get('purpose') not in PURPOSES for r in added): raise ValueError('FOREIGN_POLICY_RESERVATION')
  if len(added)>=16 or len(rows)>=59: raise ValueError('NEW_POLICY_READ_ALLOWANCE_EXHAUSTED')
  rows.append({'ordinal':len(rows)+1,'purpose':purpose,'at':datetime.now(timezone.utc).isoformat(),'freshBatchId':BATCH,'policy':POLICY});legacy.write(p,v)
  return {'ordinal':len(rows),'policyReservationCount':len(added)+1,'hardPolicyCap':16,'finalReservationOrdinal':59}
 return legacy.locked(directory,action)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--directory',required=True);sub=p.add_subparsers(dest='action',required=True)
 a=sub.add_parser('amend');a.add_argument('--expected-ledger-sha256',required=True);a.add_argument('--owner-gate-sha256',required=True);a.add_argument('--execute-local',action='store_true')
 r=sub.add_parser('reserve');r.add_argument('--purpose',required=True,choices=sorted(PURPOSES));r.add_argument('--policy',required=True,choices=[POLICY])
 args=p.parse_args();result=amend(args.directory,args.expected_ledger_sha256,args.owner_gate_sha256,args.execute_local) if args.action=='amend' else reserve(args.directory,args.purpose,args.policy)
 print(json.dumps(result))
