"""Pre-stop and recovery admission for the joined default-closed release."""
import hashlib
import json
import math
from pathlib import Path

from dev_db_binding import need

ROUTES={'ordinaryLegacyAcquire','directSourceGateway','genericBegin','sustainedBegin',
        'finiteSource','alternateServiceIngress','custodyAndTask'}
PHASES={'containment','forwardTerminalAndHistory','inverseDispatch','inverseTerminalAndCatalog',
        'restoreAndHealth','independentClosure','writerRelease'}

def verified(ref):
    data=Path(ref['path']).read_bytes()
    need(hashlib.sha256(data).hexdigest()==ref['sha256'],'FIXED_GATE_EVIDENCE_DRIFT')
    return json.loads(data)

def pre_stop(request,history_ref,budget_ref,live,now):
    need(history_ref is not None,'BLOCKED_BY_OWNING_INTERFACE_INVERSE_HISTORY')
    need(budget_ref is not None,'ACTUAL_JOINED_CLOSE_RESERVE_UNBOUND')
    history=verified(history_ref)
    budget=verified(budget_ref)
    need(history_ref['sha256']==request['historyCoverageSHA256']
         and history['status']=='INDEPENDENTLY_QUALIFIED_JOINED_INVERSE_COVERAGE'
         and history['project']==request['project'] and set(history['routes'])==ROUTES
         and history['method'] in ('CONTINUOUS_STRUCTURAL_EXCLUSION','COMPLETE_DURABLE_EFFECTS_WATERMARK'),
         'AFFECTED_HISTORY_COVERAGE_NOT_QUALIFIED')
    need(budget_ref['sha256']==request['closeBudgetProofSHA256']
         and budget['status']=='INDEPENDENTLY_QUALIFIED_JOINED_DEADLINE_AND_CLOSE'
         and budget['hostWorkerSHA256']==request['hostWorkerSHA256']
         and set(budget['worstCasePhaseSeconds'])==PHASES,'JOINED_CLOSE_BUDGET_NOT_QUALIFIED')
    phases=budget['worstCasePhaseSeconds'].values()
    need(all(type(v) in (int,float) and math.isfinite(v) and v>0 for v in phases),'INVALID_CLOSE_PHASE_LIMIT')
    reserve=sum(phases)
    need(request['T']<=now<request['cutoff']<request['D'] and request['D']-request['cutoff']>=reserve
         and request['D']-now>=reserve,'VERIFIED_RECOVERY_RESERVE_UNAVAILABLE')
    need(live['leaseId']==request['leaseId'] and live['ledgerIdentity']==request['ledgerIdentity']
         and 0<=now-live['observedAtEpoch']<=5 and live['baselineClosedHealthy'] is True
         and live['schemaAndRoleEdgesMatch'] is True and live['fivePreimagesMatch'] is True
         and live['historyBoundaryStarted'] is True,'FRESH_JOINED_PRESTOP_PROOF_REQUIRED')
    return reserve

def inverse_allowed(request,proof,now,remaining_seconds):
    return (proof.get('coverageSHA256')==request['historyCoverageSHA256']
            and proof.get('leaseId')==request['leaseId']
            and proof.get('boundaryId')==request['historyBoundaryId']
            and proof.get('completeInterval') is True and proof.get('zeroAffectedHistory') is True
            and proof.get('forwardTerminal') is True and proof.get('fullPostimagesMatch') is True
            and 0<=now-proof.get('observedAtEpoch',float('-inf'))<=5
            and now+remaining_seconds<request['D'])
