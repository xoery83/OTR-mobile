"""Join one authenticated foreground Host holder with the pinned linked PG port."""
import re
import time
from closed_driver_v5 import BASELINE, TARGET, expected_catalog, indexed
from dev_db_binding import need
from dev_maintenance_gates import inverse_allowed, pre_stop

class JoinedPort:
    def __init__(self,request,host_exchange,pg,read_catalog,read_history,clock=time.time,*,
                 read_admission=None,history_ref=None,budget_ref=None):
        self.request=request
        self.exchange=host_exchange
        self.pg=pg
        self.catalog=read_catalog
        self.history=read_history
        self.admission=read_admission
        self.history_ref=history_ref
        self.budget_ref=budget_ref
        self.clock=clock
        self.sequence=0
        self.stopped=False
        self.broken=False
        self.pre=self.post=self.last_catalog=None
        self.terminal=set()
        need(re.fullmatch('[a-f0-9]{32}',request['leaseId']) is not None,'FIXED_JOIN_LEASE_REQUIRED')
        self.expected={'leaseId':request['leaseId'],'ledgerIdentity':request['ledgerIdentity'],
                       'baselineCID':request['baselineCID'],'writerIdentity':request['writerIdentity']}
        self.pg.assert_stopped_lease=self.assert_stopped_lease

    def _host(self,command,**body):
        need(not self.broken and self.clock()<self.request['D'],'OWNED_HOST_CHANNEL_UNCERTAIN_OR_EXPIRED')
        sequence=self.sequence+1
        try:
            row=self.exchange(dict(self.expected,sequence=sequence,command=command,**body))
            need(all(row.get(k)==v for k,v in self.expected.items()) and row.get('sequence')==sequence,
                 'HOST_LEDGER_OR_LEASE_TRANSCRIPT_DRIFT')
        except Exception:
            self.broken=True
            raise
        self.sequence=sequence
        return row

    def require_writer_lease(self,request,ledger):
        need(request is self.request and str(ledger)==request['ledgerPath'],'REQUEST_OR_LEDGER_DRIFT')
        need(self._host('assert_writer')['status']=='HELD','WRITER_NOT_HELD')

    def has_intent(self):
        r=self._host('read_intents')
        need(r['status']=='OBSERVED' and type(r['present']) is bool,'INTENT_STATE_UNPROVED')
        return r['present']

    def claim_intent(self,name,digest):
        want={'forward.intent':'effectiveSQLSHA256','inverse.intent':'effectiveInverseSHA256'}
        need(name in want and digest==self.request[want[name]],'INTENT_SCOPE_DRIFT')
        if name=='forward.intent':
            self._pre_stop()
        r=self._host('claim_intent',intent=name,frameSHA256=digest)
        if r['status']=='EXISTS':
            raise FileExistsError(name)
        need(r['status']=='DURABLE','DURABLE_INTENT_UNPROVED')

    def require_closed_writer(self,request):
        self.require_writer_lease(request,request['ledgerPath'])
        r=self._host('closed_observe')
        need(r['status']==('STOPPED_CLOSED' if self.stopped else 'RUNNING_BASELINE_CLOSED'),
             'OWNED_CLOSED_STATE_UNPROVED')

    def read_catalog(self):
        self.require_closed_writer(self.request)
        rows=self.catalog()
        self.last_catalog=indexed(rows)
        if self.pre is None:
            self.pre,self.post=expected_catalog(rows)
        return rows

    def check_timing(self,cutoff,reserve_seconds):
        need(cutoff in (self.request['cutoff'],self.request['D'])
             and self.request['T']<=self.clock() and self.clock()+reserve_seconds<cutoff,
             'BOUND_RESERVE_UNAVAILABLE')

    def _pre_stop(self):
        need(self.history_ref is not None and self.budget_ref is not None and self.admission is not None,
             'PRESTOP_OWNER_AND_TIMING_EVIDENCE_REQUIRED')
        self.require_writer_lease(self.request,self.request['ledgerPath'])
        live=self.admission()
        pre_stop(self.request,self.history_ref,self.budget_ref,live,self.clock())

    def stop_exact_baseline_and_drain(self,image):
        need(image==BASELINE and not self.stopped and self.clock()<self.request['cutoff'],'STOP_SCOPE_DRIFT')
        self._pre_stop()
        r=self._host('stop_baseline')
        if self.pre_stop_restored(r):
            return 'PRESTOP_INGRESS_RESTORED'
        need(r['status']=='STOPPED_CLOSED','BASELINE_STOP_NOT_PROVED')
        self.stopped=True
        need(self.pg.drain(),'ACTIVE_OR_HIDDEN_TRANSACTION')

    def pre_stop_restored(self, receipt):
        return False

    def assert_stopped_lease(self):
        need(self.stopped,'OWNED_STOP_NOT_PROVED')
        self.require_closed_writer(self.request)

    def send_sql_once(self,frame):
        self.pg.send_once(frame)

    def terminated(self,execution_id):
        if not self.pg.terminated(execution_id):
            return False
        self.terminal.add(execution_id)
        return True

    def prove_zero_affected_history(self):
        self.assert_stopped_lease()
        v=self.history()
        self.assert_stopped_lease()
        return inverse_allowed(self.request,v,self.clock(),self.request['inverseReserveSeconds'])

    def contain_closed(self):
        need(self.stopped,'NO_CONFIRMED_STOP_RECONCILE_ONLY')
        r=self._host('contain_owned')
        need(r['status']=='STOPPED_CLOSED','HOST_CONTAINMENT_UNPROVED')
        self.stopped=True

    def start_exact_closed_target(self,image):
        need(image==self.request.get('targetImage',TARGET) and self.stopped and self.clock()<self.request['cutoff'],'TARGET_START_SCOPE_DRIFT')
        need(self.request['executionId'] in self.terminal and self.last_catalog==self.post and self.post is not None,
             'TARGET_REQUIRES_EXACT_ACK_AND_POSTIMAGE')
        proof={'disposition':'FORWARD_ACK_POSTIMAGE','frameSHA256':self.request['effectiveSQLSHA256']}
        need(self._host('start_target',proof=proof)['status']=='STARTED_OWNED','TARGET_START_UNPROVED')

    def restore_exact_closed_baseline(self,image):
        need(image==BASELINE and self.stopped,'RESTORE_SCOPE_DRIFT')
        need(self.pre is not None and self.last_catalog==self.pre,'RESTORE_PREIMAGE_DRIFT')
        if not self.pg.dispatched:
            proof={'disposition':'NO_SQL_DISPATCH_PREIMAGE'}
        else:
            need(self.request['inverseExecutionId'] in self.terminal,'INVERSE_TERMINATION_UNPROVED')
            proof={'disposition':'INVERSE_ACK_PREIMAGE','frameSHA256':self.request['effectiveInverseSHA256']}
        need(self._host('restore_baseline',proof=proof)['status']=='STARTED_OWNED','BASELINE_RESTORE_UNPROVED')

    def verify_running_closed(self,image):
        want={BASELINE:'BASELINE_CLOSED_HEALTHY',self.request.get('targetImage',TARGET):'TARGET_CLOSED_HEALTHY'}
        return image in want and self._host('independent_running_observe')['status']==want[image]

class M1JoinedPort(JoinedPort):
    def __init__(self, request, exchange, pg, catalog):
        super().__init__(request, exchange, pg, catalog, None, clock=pg.clock)

    def _pre_stop(self):
        self.require_writer_lease(self.request, self.request['ledgerPath'])
        self.check_timing(self.request['cutoff'], self.request['stopAdmissionSeconds'])

    def pre_stop_restored(self, receipt):
        return receipt['status']=='PRESTOP_INGRESS_RESTORED' and not self.pg.dispatched

    def assert_forward_admission(self):
        need(self._host('retained_write_exclusion')['status']=='RETAINED_WRITES_EXCLUDED',
             'M1_RETAINED_WRITES_NOT_EXCLUDED')

    def prove_zero_affected_history(self):
        self.assert_stopped_lease()
        return self._host('inverse_admission')['status']=='INVERSE_ADMISSIBLE'
