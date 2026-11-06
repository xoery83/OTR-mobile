"""Offline SQL wire renderer for the proposed joined recovery clock. No transport."""
import hashlib
import json
from pathlib import Path
import re
import sys

PRIVATE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PRIVATE / "c01-nov06-b-release-062a4903"))
import closed_driver_v5 as v5
from dev_commit_ack import render as attach_ack

DRIVER_SHA = "f9b07b361b595717663cacbf2f3725133c5b2a9cd5edeafbb606f2f8fe51b687"
PREIMAGE_SHA = "ca11c6fce0f2e2ecd5a9127e324375c218ab476628114d4b5a207ccd02bbeabc"
ACK_SHA = "48219b20f6431ef872103301fd52c35f9d4991be7d9b829fe933678363ffd380"
PROPOSED = {"forwardSQLComplete":480, "recoveryAt":780, "backupAt":810,
            "inverseSQLComplete":900, "hardEnd":1200}
RECOVERY_BUDGET = {"contain":30,"terminalHistory":30,"inverse":60,"restoreNames":30,
                   "baselineHealth":60,"independentOldRead":90,"publicRestore":60,"slack":60}

def build_at_cutoff(before, after, cutoff, execution_id, inverse=False):
    definition = v5.fixed(
        v5.ROOT / ("ROLLBACK_DEFINITIONS_V3.review.sql" if inverse else "FORWARD_DEFINITIONS.review.sql"),
        v5.ROLLBACK_SHA if inverse else v5.FORWARD_SHA,
    )
    authority = json.loads(v5.fixed(v5.ROOT/"DDL_AUTHORITY_CANDIDATE_V4.json", v5.DDL_AUTHORITY_SHA))
    body = authority["start"].encode() + definition + authority["end"].encode()
    renderer = PRIVATE/"core-p6-adapters-resume-v5-20261105/mutation_deadline.py"
    scope = {"__file__":str(renderer)}
    exec(compile(v5.fixed(renderer,v5.RENDERER_SHA),str(renderer),"exec"),scope)
    boundary = (
        "SET LOCAL lock_timeout='3s';\nSELECT pg_advisory_xact_lock(714024,2);\n"
        "DO $c01closed$ BEGIN IF extract(epoch FROM clock_timestamp()) >= "+str(cutoff)+
        " OR EXISTS(SELECT 1 FROM public.trip_source_universal_scope)"
        " OR EXISTS(SELECT 1 FROM public.universal_import_provider_scope)"
        " THEN RAISE EXCEPTION 'C01_SCOPE_OR_CUTOFF'; END IF; END $c01closed$;\n"
    )
    first,last = (after,before) if inverse else (before,after)
    primitive = ("BEGIN;\n"+boundary+v5.catalog_guard(first)).encode()+body+(
        v5.catalog_guard(last)+"COMMIT;\n").encode()
    frame = scope["render"](primitive,cutoff,execution_id)
    v5.require(frame.startswith(b"BEGIN;\n"),"RENDERER_TRANSACTION_PREFIX_DRIFT")
    return b"BEGIN ISOLATION LEVEL READ COMMITTED;\n"+frame[len(b"BEGIN;\n"):]

def fixed_preimage():
    file = PRIVATE/"c01-nov06-b-closed-preimage/ACTUAL_POSTGRES.private.json"
    return v5.expected_catalog(json.loads(v5.fixed(file,PREIMAGE_SHA))["catalog"])

def joined_wires(start, forward_id, inverse_id):
    v5.require(type(start) is int and 0 < start < 4102444800
               and forward_id != inverse_id and all(isinstance(x,str) and
                   re.fullmatch("[0-9a-f]{32}",x) for x in (forward_id,inverse_id)),
               "EXACT_ABSOLUTE_JOIN_CLOCK_AND_IDS_REQUIRED")
    v5.fixed(Path(v5.__file__), DRIVER_SHA)
    v5.fixed(v5.ROOT/"dev_commit_ack.py", ACK_SHA)
    before, after = fixed_preimage()
    result = {}
    for direction, key, execution_id in (("forward","forwardSQLComplete",forward_id),
                                         ("inverse","inverseSQLComplete",inverse_id)):
        deadline = start+PROPOSED[key]
        frame = build_at_cutoff(before,after,deadline,execution_id,inverse=direction=="inverse")
        wire = attach_ack(frame,execution_id)
        result[direction] = {"frame":frame,"wire":wire,"executionId":execution_id,
                             "sqlDeadline":deadline,"frameSHA256":hashlib.sha256(frame).hexdigest(),
                             "wireSHA256":hashlib.sha256(wire).hexdigest()}
    return result
