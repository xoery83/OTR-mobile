"""Fixed foreground Host endpoint for an enrolled M1 manifest."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

from dev_db_binding import M1_CATALOG_QUERY_SHA256, evidence_sha
from dev_host_worker import DEFAULT, HostWorker, need
from m1_foreground import ForegroundLost, serve

RUNTIME = Path("/run/otr/root2-c01-keep-v5")
LEDGER = Path("/var/lib/otr/root2-c01-maintenance")
LOCK = Path("/run/lock/otr-universal-finite-service.lock")


def fixed(path, digest):
    need(re.fullmatch(r"[a-f0-9]{64}", digest) and path.resolve() == path,
         "M1_HOST_PIN_UNBOUND")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) == 0o400 and info.st_size <= 262144,
             "M1_HOST_FILE_UNSAFE")
        raw = stream.read(262145)
    need(hashlib.sha256(raw).hexdigest() == digest, "M1_HOST_FILE_DRIFT")
    return raw


def load(path, digest):
    scope = {"__file__": str(path), "__name__": "m1_sealed_binding"}
    exec(compile(fixed(path, digest), str(path), "exec"), scope)
    return scope


class PreStopRestored(Exception):
    pass


class M1HostWorker(HostWorker):
    def __init__(self, request, lease, ops, clock=time.time):
        super().__init__(request, lease, ops, clock)
        self.restored_ingress = False
        self.running_status = None
        self.recovery_enrolled = False
        self.recovery = None
        self.recovery_name = "otr-c01-recovery-" + request["executionId"]
        need(ops.preflight() is True, "M1_HOST_PREFLIGHT_UNPROVED")

    def stop_original(self):
        self.guard(self.req["cutoff"])
        need(self.ops.fence_before_stop() is True, "M1_INGRESS_FENCE_UNPROVED")
        pdf = self.ops.stop_pdf()
        if pdf is False:
            # A negative receipt is eligible only when independent readback proves
            # both services are still in their exact preimages and the fence landed.
            self.guard()
            baseline = self.ops.running_baseline()
            need(not self.stop_attempted and self.observe_closed() == "RUNNING_BASELINE_CLOSED"
                 and baseline["Id"] == self.before["Id"]
                 and baseline["State"]["StartedAt"] == self.before["State"]["StartedAt"]
                 and self.ops.verify_pdf_preimage() is True
                 and self.ops.verify_ingress_fenced() is True,
                 "M1_PRESTOP_STATE_UNPROVED")
            self.guard()
            need(self.ops.restore_ingress_before_stop() is True, "M1_PRESTOP_ROUTE_RESTORE_UNPROVED")
            raise PreStopRestored
        need(pdf is True, "M1_PDF_STOP_OUTCOME_UNKNOWN")
        self.guard(self.req["cutoff"])
        super().stop_original()

    def assert_retired_original(self):
        need(self.closed_instance is not None and self.ops.verify_original_stopped(self.closed_instance) is True,
             "M1_ORIGINAL_STOPPED_IDENTITY_UNPROVED")

    def restore(self):
        self.guard()
        need(not self.restore_attempted and self.observe_closed() == "STOPPED_CLOSED",
             "RESTORE_ONCE_STOPPED_REQUIRED")
        need(self.clock() + self.req["healthReserveSeconds"] < self.req["D"],
             "RESTORE_RESERVE_UNAVAILABLE")
        self.assert_retired_original()
        need(self.ops.lookup(self.recovery_name) is None, "M1_RECOVERY_NAME_COLLISION")
        self.restore_attempted = True
        self.guard()
        self.recovery = self.ops.create_recovery(self.recovery_name, self.before)
        need(self.recovery not in (self.before["Id"], self.candidate), "M1_RECOVERY_ID_COLLISION")
        recovery = self.ops.verify_recovery(self.before, self.recovery)
        need(recovery["Name"] == "/" + self.recovery_name and recovery["State"]["Status"] == "created",
             "M1_RECOVERY_NOT_STAGED")
        self.guard()
        need(self.clock() + self.req["healthReserveSeconds"] < self.req["D"]
             and self.observe_closed() == "STOPPED_CLOSED", "M1_RECOVERY_START_ADMISSION_DRIFT")
        self.assert_retired_original()
        current = self.ops.lookup(DEFAULT)
        if current is not None:
            if current["Id"] == self.before["Id"]:
                retained_name = self.backup
            else:
                need(current["Id"] == self.candidate, "OWNED_TARGET_MOVE_UNPROVED")
                self.ops.verify_target(self.before, self.candidate)
                retained_name = self.staged
            need(self.ops.lookup(retained_name) is None, "M1_RECOVERY_RETAINED_NAME_COLLISION")
            self.guard()
            self.ops.rename(current["Id"], retained_name)
        else:
            original = self.ops.baseline(self.before["Id"])
            need(original["Name"] == "/" + self.backup, "RETAINED_NAME_DRIFT")
        need(self.ops.lookup(DEFAULT) is None, "DEFAULT_RENAME_COLLISION")
        self.guard()
        self.ops.rename(self.recovery, DEFAULT)
        recovery = self.ops.verify_recovery(self.before, self.recovery)
        need(recovery["Name"] == "/" + DEFAULT and recovery["State"]["Status"] == "created"
             and self.ops.baseline(self.before["Id"])["Name"] == "/" + self.backup,
             "M1_RECOVERY_START_IDENTITY_DRIFT")
        self.assert_retired_original()
        self.guard()
        self.ops.start(self.recovery)
        return "STARTED_OWNED"

    def running_cid(self, target):
        return self.candidate if target else self.recovery

    def phase_readback(self, row):
        proof = row.get("readback")
        need(isinstance(proof, dict) and set(proof) == {
             "phase", "querySHA256", "catalogSHA256", "systemIdentifier",
             "readerPid", "observedAt", "stoppedSHA256"}
             and proof["phase"] == row["command"]
             and proof["querySHA256"] == M1_CATALOG_QUERY_SHA256
             and isinstance(proof["catalogSHA256"], str)
             and re.fullmatch(r"[a-f0-9]{64}", proof["catalogSHA256"])
             and proof["systemIdentifier"] == self.req["pgSystemIdentifier"]
             and type(proof["readerPid"]) is int and proof["readerPid"] > 0
             and type(proof["observedAt"]) in (int, float)
             and 0 <= self.clock() - proof["observedAt"] <= 15
             and self.closed_instance is not None
             and proof["stoppedSHA256"] == evidence_sha(self.closed_instance),
             "M1_INDEPENDENT_PHASE_READBACK_UNPROVED")
        return proof

    def handle(self, row):
        command = row["command"]
        if command == "claim_intent" and row.get("intent") == "forward.intent" and not self.recovery_enrolled:
            self.guard(self.req["cutoff"])
            need(all(row.get(key) == value for key, value in self.expected.items())
                 and row["sequence"] == self.sequence + 1
                 and row.get("frameSHA256") == self.req["effectiveSQLSHA256"]
                 and not self.lease.has_intent() and self.observe_closed() == "RUNNING_BASELINE_CLOSED",
                 "M1_RECOVERY_ENROLLMENT_ADMISSION_UNPROVED")
            self.ops.enroll_recovery_file()
            self.recovery_enrolled = True
        if command == "stop_baseline":
            need(self.recovery_enrolled, "M1_RECOVERY_ENROLLMENT_REQUIRED")
        if command in ("retained_write_exclusion", "inverse_admission", "release_running"):
            need(all(row.get(key) == value for key, value in self.expected.items())
                 and row["sequence"] == self.sequence + 1, "HOST_TRANSCRIPT_DRIFT")
            if command == "release_running":
                self.guard()
                need(self.running_status is not None and not self.restored_ingress,
                     "M1_RELEASE_HEALTH_UNPROVED_OR_ATTEMPTED")
                self.assert_retired_original()
                target = self.running_status == "TARGET_CLOSED_HEALTHY"
                self.ops.verify_running(self.running_cid(target), self.before, target, self.req["D"])
                readback = self.phase_readback(row)
                self.guard()
                self.sequence += 1
                self.restored_ingress = True
                need(self.ops.restore_pdf_and_routes(self.running_status, self.closed_instance, readback) is True,
                     "M1_PDF_ROUTE_RESTORE_UNPROVED")
                return dict(self.expected, sequence=self.sequence, status="RELEASED_CLOSED")
            self.guard(self.req["cutoff" if command == "retained_write_exclusion" else "inverseCutoff"])
            need(row["sequence"] == self.sequence + 1 and self.observe_closed() == "STOPPED_CLOSED",
                 "M1_STOPPED_IDENTITY_UNPROVED")
            readback = self.phase_readback(row)
            self.sequence += 1
            original_stopped = self.ops.verify_original_stopped(self.closed_instance) is True
            if command == "retained_write_exclusion":
                ok = original_stopped and self.ops.assert_retained_write_exclusion(self.req, self.closed_instance, readback)
                status = "RETAINED_WRITES_EXCLUDED" if ok is True else "RETAINED_WRITES_UNPROVED"
            else:
                ok = original_stopped and self.ops.assert_inverse_admission(self.req, self.closed_instance, readback)
                status = "INVERSE_ADMISSIBLE" if ok is True else "INVERSE_UNPROVED"
            self.guard()
            return dict(self.expected, sequence=self.sequence, status=status)
        try:
            reply = super().handle(row)
        except PreStopRestored:
            need(command == "stop_baseline" and self.sequence == row["sequence"],
                 "M1_PRESTOP_RECEIPT_DRIFT")
            return dict(self.expected, sequence=self.sequence, status="PRESTOP_INGRESS_RESTORED")
        except (OSError, ValueError):
            if (command != "independent_running_observe" or not self.start_attempted
                    or self.restore_attempted or self.sequence != row["sequence"]
                    or self.observe_closed() != "STOPPED_CLOSED"):
                raise
            return dict(self.expected, sequence=self.sequence, status="TARGET_STOPPED_UNVERIFIED")
        if command == "independent_running_observe":
            self.guard()
            need(not self.restored_ingress, "M1_PDF_ROUTE_RESTORE_ALREADY_ATTEMPTED")
            self.assert_retired_original()
            self.guard()
            self.running_status = reply["status"]
        if reply["status"] == "STOPPED_CLOSED":
            reply["stoppedSHA256"] = evidence_sha(self.closed_instance)
        return reply


def run(execution_id, manifest_sha, binding_sha, stdin, stdout):
    need(re.fullmatch(r"[a-f0-9]{32}", execution_id), "M1_EXECUTION_ID_UNBOUND")
    runtime, ledger = RUNTIME / execution_id, LEDGER / execution_id
    authority = json.loads(fixed(runtime / "m1-binding.json", binding_sha))
    need(authority["manifestSHA256"] == manifest_sha and authority["executionId"] == execution_id,
         "M1_HOST_BINDING_DRIFT")
    installer = load(runtime / "host_install.py", authority["installerSHA256"])
    raw = fixed(ledger / "plan.json", manifest_sha)
    config = installer["m1_plan"](raw, manifest_sha)
    need(config["executionId"] == execution_id
         and re.fullmatch(r"[a-f0-9]{32}", authority["leaseId"]) and authority["leaseId"] != execution_id
         and config["T"] <= time.time() and time.time() + 60 < config["cutoff"],
         "M1_HOST_ADMISSION_DRIFT")
    config.update(leaseId=authority["leaseId"], ledgerIdentity=authority["ledgerIdentity"],
                  ledgerPath=str(ledger), hostBindingSHA256=binding_sha,
                  controlsSHA256=authority.get("controlsSHA256"))
    actions = load(runtime / "m1-host-actions.py", authority["actionsSHA256"])

    def worker(request, lease):
        ops = actions["build_ops"](request, json.loads(raw)["host"], lease)
        return M1HostWorker(request, lease, ops, clock=time.time)

    serve(config, LOCK, ledger, worker, stdin, stdout)


if __name__ == "__main__":
    try:
        need(os.geteuid() == 0 and len(sys.argv) == 4, "M1_HOST_ROOT_REQUIRED")
        run(*sys.argv[1:], sys.stdin.buffer, sys.stdout.buffer)
    except (ForegroundLost, OSError, KeyError, ValueError, TypeError):
        sys.exit(1)
