"""Foreground Host lifecycle for the exact joined C01 package. No autonomous actions."""
import json
import re
import subprocess
import time

from host_target_binding import BASELINE,TARGET,create_exact_target,verify_target

DEFAULT='otr-dev-backend'
DOCKER_SOCKET='/var/run/docker.sock'

def need(ok,reason):
    if not ok:
        raise ValueError(reason)

class HostWorker:
    def __init__(self,request,lease,ops,clock=time.time):
        self.req=request
        self.lease=lease
        self.ops=ops
        self.clock=clock
        self.sequence=0
        self.closed_instance=None
        self.stop_attempted=False
        self.start_attempted=False
        self.restore_attempted=False
        self.contain_attempted=False
        self.candidate=None
        self.reservations=set()
        self.expected={'leaseId':request['leaseId'],'writerIdentity':list(lease.lock_identity),
                       'ledgerIdentity':list(lease.ledger_identity),'baselineCID':request['baselineCID']}
        need(re.fullmatch('[a-f0-9]{32}',request['executionId']) and re.fullmatch('[a-f0-9]{32}',request['leaseId']),
             'FIXED_CONTROL_IDS_REQUIRED')
        self.backup='otr-c01-retained-'+request['executionId']
        self.staged='otr-c01-candidate-'+request['executionId']
        self.before=ops.running_baseline()
        need(self.before['Id']==request['baselineCID'],'EXACT_BASELINE_REQUIRED')

    def guard(self,cutoff=None):
        now=self.clock()
        self.lease.assert_current(self.lease.ledger)
        need(self.req['T']<=now<(cutoff if cutoff is not None else self.req['D']),'CONTROL_DEADLINE')
        self.ops.assert_timers_closed()

    def observe_closed(self):
        baseline=self.ops.baseline(self.before['Id'])
        if not self.stop_attempted:
            need(baseline['Name']=='/'+DEFAULT and baseline['State']['Running']
                 and baseline['State']['StartedAt']==self.before['State']['StartedAt'],'RUNNING_BASELINE_DRIFT')
            return 'RUNNING_BASELINE_CLOSED'
        need(self.closed_instance is not None and self.ops.stopped_instance(baseline)==self.closed_instance,
             'EXACT_STOPPED_INSTANCE_UNPROVED')
        current=self.ops.lookup(DEFAULT)
        need(current is None or current['Id'] in (baseline['Id'],self.candidate),'FOREIGN_DEFAULT')
        need(current is None or not current['State']['Running'],'SERVICE_NOT_FENCED')
        return 'STOPPED_CLOSED'

    def stop(self):
        self.guard(self.req['cutoff'])
        need('forward.intent' in self.reservations and not self.stop_attempted,'STOP_ONCE_INTENT_REQUIRED')
        need(self.clock()+self.req['stopAdmissionSeconds']<self.req['cutoff'],'STOP_RESERVE_UNAVAILABLE')
        need(self.ops.target_present() and self.ops.lookup(self.backup) is None and self.ops.lookup(self.staged) is None,
             'TARGET_OR_RESERVED_NAMES_NOT_READY')
        need(self.observe_closed()=='RUNNING_BASELINE_CLOSED','STOP_PREIMAGE_DRIFT')
        self.candidate=self.ops.create(self.staged,self.before)
        self.ops.verify_target(self.before,self.candidate)
        self.guard(self.req['cutoff'])
        need(self.clock()+self.req['stopAdmissionSeconds']<self.req['cutoff']
             and self.observe_closed()=='RUNNING_BASELINE_CLOSED','POST_STAGE_STOP_ADMISSION_DRIFT')
        self.stop_original()
        s=self.ops.baseline(self.before['Id'])
        self.closed_instance=self.ops.stopped_instance(s)
        return self.observe_closed()

    def stop_original(self):
        self.stop_attempted=True
        self.ops.stop_once(self.before['Id'])

    def start_target(self):
        self.guard(self.req['cutoff'])
        need(not self.start_attempted and self.observe_closed()=='STOPPED_CLOSED','START_ONCE_STOPPED_REQUIRED')
        need(self.clock()+self.req['healthReserveSeconds']<self.req['cutoff'],'START_RESERVE_UNAVAILABLE')
        need(self.candidate is not None,'EXACT_STAGED_CID_REQUIRED')
        self.start_attempted=True
        self.ops.verify_target(self.before,self.candidate)
        self.guard(self.req['cutoff'])
        self.ops.rename(self.before['Id'],self.backup)
        need(self.ops.lookup(DEFAULT) is None,'DEFAULT_RENAME_COLLISION')
        self.guard(self.req['cutoff'])
        self.ops.rename(self.candidate,DEFAULT)
        self.guard(self.req['cutoff'])
        self.ops.start(self.candidate)
        return 'STARTED_OWNED'

    def contain(self):
        self.guard()
        need(self.closed_instance is not None,'BASELINE_STOP_UNKNOWN_READ_ONLY')
        current=self.ops.lookup(DEFAULT)
        need(current is None or current['Id'] in (self.before['Id'],self.candidate),'FOREIGN_DEFAULT')
        if current is not None and current['State']['Running']:
            need(current['Id']==self.candidate and self.start_attempted and not self.contain_attempted,
                 'UNOWNED_OR_REPEATED_CONTAINMENT')
            self.ops.verify_target(self.before,self.candidate)
            self.contain_attempted=True
            self.ops.stop_once(self.candidate)
        return self.observe_closed()

    def restore(self):
        self.guard()
        need(not self.restore_attempted and self.observe_closed()=='STOPPED_CLOSED','RESTORE_ONCE_STOPPED_REQUIRED')
        need(self.clock()+self.req['healthReserveSeconds']<self.req['D'],'RESTORE_RESERVE_UNAVAILABLE')
        self.restore_attempted=True
        current=self.ops.lookup(DEFAULT)
        if current is not None and current['Id']!=self.before['Id']:
            need(current['Id']==self.candidate and self.ops.lookup(self.staged) is None,'OWNED_TARGET_MOVE_UNPROVED')
            self.ops.verify_target(self.before,self.candidate)
            self.guard()
            self.ops.rename(self.candidate,self.staged)
        original=self.ops.baseline(self.before['Id'])
        if original['Name']!='/'+DEFAULT:
            need(original['Name']=='/'+self.backup and self.ops.lookup(DEFAULT) is None,'RETAINED_NAME_DRIFT')
            self.guard()
            self.ops.rename(original['Id'],DEFAULT)
        self.guard()
        self.ops.start(original['Id'])
        return 'STARTED_OWNED'

    def running_cid(self, target):
        return self.candidate if target else self.before['Id']

    def handle(self,r):
        self.guard()
        seq=self.sequence+1
        need(all(r.get(k)==v for k,v in self.expected.items()) and r.get('sequence')==seq,'HOST_TRANSCRIPT_DRIFT')
        self.sequence=seq
        cmd=r['command']
        extra={}
        if cmd=='assert_writer':
            status='HELD'
        elif cmd=='read_intents':
            status='OBSERVED'
            extra={'present':self.lease.has_intent()}
        elif cmd=='claim_intent':
            names={'forward.intent':'effectiveSQLSHA256','inverse.intent':'effectiveInverseSHA256'}
            n=r['intent']
            need(n in names and r['frameSHA256']==self.req[names[n]],'FIXED_INTENT_DRIFT')
            need((n=='forward.intent' and not self.stop_attempted) or
                 (n=='inverse.intent' and self.observe_closed()=='STOPPED_CLOSED'),'INTENT_PHASE_DRIFT')
            try:
                self.lease.claim_intent(n,r['frameSHA256'])
                self.reservations.add(n)
                status='DURABLE'
            except FileExistsError:
                status='EXISTS'
        elif cmd=='closed_observe':
            status=self.observe_closed()
        elif cmd=='stop_baseline':
            status=self.stop()
        elif cmd=='start_target':
            need(r.get('proof')=={'disposition':'FORWARD_ACK_POSTIMAGE','frameSHA256':self.req['effectiveSQLSHA256']},
                 'TARGET_REQUIRES_EXACT_ACK_AND_POSTIMAGE')
            status=self.start_target()
        elif cmd=='contain_owned':
            status=self.contain()
        elif cmd=='restore_baseline':
            proof=r.get('proof')
            allowed={'disposition':'NO_SQL_DISPATCH_PREIMAGE'}
            inverse={'disposition':'INVERSE_ACK_PREIMAGE','frameSHA256':self.req['effectiveInverseSHA256']}
            need((proof==allowed and 'inverse.intent' not in self.reservations) or
                 (proof==inverse and 'inverse.intent' in self.reservations),'RESTORE_REQUIRES_EXACT_PREIMAGE')
            status=self.restore()
        elif cmd=='independent_running_observe':
            target=not self.restore_attempted
            cid=self.running_cid(target)
            self.ops.verify_running(cid,self.before,target,self.req['D'])
            status='TARGET_CLOSED_HEALTHY' if target else 'BASELINE_CLOSED_HEALTHY'
        else:
            raise ValueError('UNSUPPORTED_HOST_COMMAND')
        return dict(self.expected,sequence=seq,status=status,**extra)

class DockerOps:
    """Adapt the pinned, previously qualified closed Host observations."""
    def __init__(self,prior,plan,bundles,*,target=TARGET):
        self.prior=prior
        self.plan=plan
        self.bundles=bundles
        self.target=target

    def inspect(self,cid):
        s,=json.loads(self.prior.invoke(['docker','inspect',cid]))
        need(s['Id']==cid,'EXACT_CID_DRIFT')
        return s

    def assert_timers_closed(self):
        rows=self.prior.invoke(['systemctl','list-units','--all','--plain','--no-legend','--type=timer','--state=active'])
        need(not any(row.strip().startswith(('otr-mcp-','otr-auth-','otr-universal-finite-')) for row in rows.splitlines()),
             'PROTECTED_TIMER_ACTIVE')

    def running_baseline(self):
        return self.prior.check_running(self.plan)[0]

    def baseline(self,cid):
        s=self.inspect(cid)
        fp=self.prior.fixed_projection(s)
        need(all(fp[k]==self.plan['expectedResourceFingerprint'][k] for k in fp),'RETAINED_FINGERPRINT_DRIFT')
        self.prior.checked_files(self.plan)
        self.prior.finite_disabled(s,self.plan)
        self.prior.closed_formats(s,self.plan)
        return s

    def stopped_instance(self,s): return self.prior.stopped_instance(s)
    def lookup(self,name): return self.prior.lookup_name(name)

    def target_present(self):
        return self.prior.invoke(['docker','image','inspect',self.target,'--format','{{.Id}}']).strip()==self.target

    def stop_once(self,cid):
        try:
            self.prior.invoke(['docker','stop','--time','10',cid])
        except subprocess.SubprocessError:
            pass
        need(not self.inspect(cid)['State']['Running'],'STOP_OUTCOME_UNKNOWN')

    def create(self,name,baseline): return create_exact_target(DOCKER_SOCKET,name,baseline,self.target)
    def verify_target(self,baseline,cid):
        candidate=self.inspect(cid)
        # Historical exact Docker cgroup-v2 inspect normalization, only while created.
        actual=candidate['HostConfig']
        if (candidate['State']['Status']=='created' and baseline['HostConfig'].get('OomKillDisable') is None
            and actual.get('OomKillDisable') is False):
            candidate={**candidate,'HostConfig':{**actual,'OomKillDisable':None}}
        verify_target(baseline,candidate,cid,self.target)
    def rename(self,cid,name): self.prior.invoke(['docker','rename',cid,name])
    def start(self,cid): self.prior.invoke(['docker','start',cid])

    def verify_running(self,cid,baseline,target,deadline):
        until=min(deadline,time.time()+60)
        while time.time()<until:
            self.assert_timers_closed()
            s=self.inspect(cid)
            if target:
                self.verify_target(baseline,cid)
            else:
                self.baseline(cid)
            need(s['Name']=='/'+DEFAULT and s['State']['Running'],'OWNED_RUNNING_INSTANCE_REQUIRED')
            if s['State'].get('Health',{}).get('Status')=='healthy':
                self.prior.checked_files(self.plan)
                self.prior.finite_disabled(s,self.plan)
                self.prior.closed_formats(s,self.plan)
                files={m['Destination']:m['Source'] for m in s['Mounts']}
                for path in ('/run/otr/universal-runtime.json','/run/otr/universal-png-runtime.json'):
                    pin=self.plan['hostFilePins'][files[path]]
                    need(self.prior.invoke(['docker','exec',cid,'sha256sum',path]).split()[0]==pin,'PROCESS_VISIBLE_MOUNT_DRIFT')
                expected=self.bundles if target else self.plan['bundlePins']
                actual={name:self.prior.invoke(['docker','exec',cid,'sha256sum','/app/'+name]).split()[0] for name in expected}
                need(actual==expected and self.prior.health_http()==200,'OWNED_HEALTH_OR_BUNDLE_DRIFT')
                after=self.inspect(cid)
                need(after['State']['StartedAt']==s['State']['StartedAt'] and after['Name']=='/'+DEFAULT
                     and after['State']['Running'] and time.time()<until,'OWNED_INSTANCE_CHANGED')
                return
            time.sleep(.2)
        raise ValueError('INDEPENDENT_CLOSURE_TIMEOUT')
