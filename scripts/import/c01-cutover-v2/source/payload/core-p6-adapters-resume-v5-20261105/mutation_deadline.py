"""PG17 total transaction frame. Unbound until exact rendered-frame authorization/qualification."""
import hashlib,math,re,time
sha=lambda b:hashlib.sha256(b).hexdigest()
def need(ok,reason):
 if not ok:raise ValueError(reason)
def render(primitive,deadline,execution_id):
 need(isinstance(deadline,(int,float)) and math.isfinite(deadline) and deadline>0,'FINITE_ABSOLUTE_DEADLINE_REQUIRED')
 need(re.fullmatch('[a-f0-9]{32}',execution_id) is not None,'EXACT_EXECUTION_ID_REQUIRED')
 text=primitive.decode();need(text.startswith('BEGIN;\n') and text.endswith('COMMIT;\n'),'FIXED_ATOMIC_PRIMITIVE_REQUIRED')
 body=text[len('BEGIN;\n'):-len('COMMIT;\n')]
 # Body is separately hash-pinned by envelope, not accepted as arbitrary SQL.
 epoch=str(float(deadline));tag='root2-p6-mutator-'+execution_id
 guard="IF extract(epoch FROM clock_timestamp()) >= "+epoch+"-0.25 THEN RAISE EXCEPTION 'P6_ABSOLUTE_DEADLINE_NO_COMMIT'; END IF;"
 prefix="BEGIN;\nDO $p6deadline$ DECLARE ms integer; BEGIN IF current_setting('server_version_num')::integer<170000 OR session_user<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'P6_PG17_PRINCIPAL_REQUIRED'; END IF; "+guard+" ms:=floor(("+epoch+"-extract(epoch FROM clock_timestamp())-0.25)*1000); IF ms<1 OR ms>1800000 THEN RAISE EXCEPTION 'P6_FINITE_TOTAL_DEADLINE_REQUIRED'; END IF; PERFORM set_config('transaction_timeout',ms::text,true); PERFORM set_config('application_name','"+tag+"',true); IF current_setting('transaction_timeout')::interval<>ms*interval '1 millisecond' THEN RAISE EXCEPTION 'P6_EFFECTIVE_TOTAL_TIMEOUT_REQUIRED'; END IF; END $p6deadline$;\n"
 suffix="DO $p6precommit$ BEGIN "+guard+" IF current_setting('transaction_timeout')::interval<=interval '0 seconds' THEN RAISE EXCEPTION 'P6_TOTAL_TIMEOUT_LOST'; END IF; END $p6precommit$;\nCOMMIT;\n"
 return (prefix+body+suffix).encode()

def observe_sql(execution_id):
 need(re.fullmatch('[a-f0-9]{32}',execution_id) is not None,'EXACT_EXECUTION_ID_REQUIRED')
 return "BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT pid,xact_start::text,application_name,usename FROM pg_stat_activity WHERE application_name='root2-p6-mutator-"+execution_id+"' AND usename='postgres' AND pid<>pg_backend_pid();ROLLBACK;"

# Exact frame/primitive/SQL identity is additionally required by the fixed Owner policy before any send.

from pathlib import Path
import os

def prepare_frame(primitive,request):
 code_sha=sha(Path(__file__).read_bytes())
 need(request['mutationDeadlineFrameCodeSHA256']==code_sha,'EXACT_APPROVED_FRAME_CODE_REQUIRED')
 need(sha(primitive)==request['primitiveSHA256'],'EXACT_APPROVED_PRIMITIVE_REQUIRED')
 frame=render(primitive,request['deadlineEpoch'],request['executionId'])
 need(sha(frame)==request['effectiveSQLSHA256'],'EXACT_APPROVED_EFFECTIVE_SQL_REQUIRED')
 return frame,{'frameCodeSHA256':code_sha,'primitiveSHA256':sha(primitive),'effectiveSQLSHA256':sha(frame),'deadlineEpoch':request['deadlineEpoch'],'executionId':request['executionId']}

def execute_once(sql,primitive,request,exclusion):
 frame,identity=prepare_frame(primitive,request)
 exclusion.assert_current(request,None)
 # No retry after this boundary. Caller seals this frame and intent before calling.
 sql(frame.decode())
 # A return after deadline is still ACK, never NoCommit; caller must retain readback/receipt classification.
 return {'disposition':'ACKNOWLEDGED','ackObservedAtEpoch':time.time(),**identity}

def observe_termination(sql,request):
 rows=sql(observe_sql(request['executionId']))['rows']
 return {'activeOwnSessions':rows,'observedAtEpoch':time.time(),'applicationName':'root2-p6-mutator-'+request['executionId'],'scope':'ACK only; UNKNOWN tag absence is not NoCommit or a resume certificate'}
