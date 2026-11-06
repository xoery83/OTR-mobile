"""Bind the exact V5 frame and its post-COMMIT marker to separately sealed wire bytes."""
import hashlib
import re
from dev_db_binding import need, result_value

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def render(frame,execution_id):
    need(re.fullmatch('[a-f0-9]{32}',execution_id) is not None,'EXACT_DISPATCH_ID_REQUIRED')
    tag='root2-p6-mutator-'+execution_id
    need(frame.startswith(b'BEGIN ISOLATION LEVEL READ COMMITTED;\n') and frame.endswith(b'\nCOMMIT;\n')
         and frame.count(tag.encode())==1,'EXACT_V5_FRAME_REQUIRED')
    sql=("SELECT pg_catalog.jsonb_build_object('marker','"+execution_id
         +"','frameSHA256','"+sha(frame)+"','backendPid',pg_catalog.pg_backend_pid(),"
         "'sessionUser',session_user,'currentUser',current_user,"
         "'tagReset',pg_catalog.current_setting('application_name')<>'"+tag+"') AS result;\n")
    return frame+sql.encode()

class CommitAck:
    def __init__(self,sql,pins):
        self.sql=sql
        self.pins=pins
        self.attempted=set()
        self.backend_pid=None

    def __call__(self,frame,execution_id):
        wire=render(frame,execution_id)
        frame_sha=sha(frame)
        need(self.pins.get(execution_id)=={'frameSHA256':frame_sha,'wireSHA256':sha(wire)}
             and execution_id not in self.attempted,'UNAPPROVED_OR_CONSUMED_DISPATCH_WIRE')
        self.attempted.add(execution_id)
        r=result_value(self.sql(wire.decode()))
        need(r['marker']==execution_id and r['frameSHA256']==frame_sha and r['sessionUser']==r['currentUser']=='postgres'
             and r['tagReset'] is True and type(r['backendPid']) is int and r['backendPid']>0,
             'EXACT_POST_COMMIT_MARKER_UNPROVED')
        self.backend_pid=r['backendPid']
        return {'disposition':'ACKNOWLEDGED','executionId':execution_id,'effectiveSQLSHA256':frame_sha}
