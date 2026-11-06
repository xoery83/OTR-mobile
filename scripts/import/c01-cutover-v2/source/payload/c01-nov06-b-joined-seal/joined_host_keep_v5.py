"""Host entry for the exact closed 3cc4ae79 window."""
import copy
import http.client
import json
import re
import socket

from dev_host_worker import HostWorker, need
from keep_v5_choice import choose
from stage_writer import BASELINE, TARGET, joined_binding
from terminal_policy import sql_terminal

ARCHIVE_SHA256 = "ad74e6e00fe458e91f34fad62840b128afdc2a14f22d01f944f70876eaecef8f"


def target_payload(baseline):
    need(baseline["Image"] == BASELINE, "WRONG_RETAINED_IMAGE")
    config = copy.deepcopy(baseline["Config"])
    config["Image"] = TARGET
    return {**config, "HostConfig": copy.deepcopy(baseline["HostConfig"])}


def create_target(path, name, baseline):
    need(re.fullmatch(r"[a-z0-9][a-z0-9-]{1,90}", name), "INVALID_OWNED_TARGET_NAME")

    class UnixDocker(http.client.HTTPConnection):
        def connect(self):
            self.sock = socket.socket(socket.AF_UNIX)
            self.sock.settimeout(15)
            self.sock.connect(path)

    conn = UnixDocker("localhost", timeout=15)
    try:
        conn.request("POST", "/v1.47/containers/create?name="+name,
                     body=json.dumps(target_payload(baseline)).encode(),
                     headers={"Content-Type": "application/json"})
        response = conn.getresponse()
        need(response.status == 201, "CREATE_UNCONFIRMED_READ_ONLY_LOOKUP_REQUIRED")
        cid = json.loads(response.read(131072))["Id"]
        need(re.fullmatch("[0-9a-f]{64}", cid), "TARGET_CID_UNCONFIRMED")
        return cid
    finally:
        conn.close()


def verify_target(baseline, candidate, cid):
    expected = target_payload(baseline)
    host = expected.pop("HostConfig")
    actual = candidate["HostConfig"]
    if (candidate["State"]["Status"] == "created" and host.get("OomKillDisable") is None
            and actual.get("OomKillDisable") is False):
        actual = {**actual, "OomKillDisable": None}
    need((candidate["Id"], candidate["Image"], candidate["Config"], actual)
         == (cid, TARGET, expected, host), "TARGET_CONFIG_DRIFT")
    fields = ("Source", "Destination", "RW", "Type", "Propagation")
    def mounts(container):
        return sorted(tuple(m.get(k) for k in fields) for m in container["Mounts"])
    need(mounts(candidate) == mounts(baseline), "TARGET_MOUNT_DRIFT")


class ClosedJoinedHost:
    def __init__(self, request, clock, writer, ops):
        need(clock == joined_binding(request["T"], BASELINE, TARGET)
             and request["cutoff"] == clock["forwardSQLComplete"]
             and request["D"] == clock["hardEnd"]
             and request["archiveSHA256"] == ARCHIVE_SHA256
             and request["effectiveSQLSHA256"] == writer.pins["v5-forward"],
             "EXACT_JOINED_HOST_WINDOW_REQUIRED")
        self.clock = clock
        self.writer = writer
        self.worker = HostWorker(request, writer, ops)
        need(self.worker.before["Image"] == BASELINE, "WRONG_RETAINED_IMAGE")

    def claim(self, action):
        self.worker.guard()
        self.writer.claim(action, self.writer.pins[action])

    def stage(self):
        worker = self.worker
        worker.guard(worker.req["cutoff"])
        need(worker.candidate is None and worker.ops.target_present()
             and worker.ops.lookup(worker.backup) is None and worker.ops.lookup(worker.staged) is None,
             "TARGET_OR_RESERVED_NAMES_NOT_READY")
        need(worker.observe_closed() == "RUNNING_BASELINE_CLOSED", "STOP_PREIMAGE_DRIFT")
        self.claim("stage-candidate")
        worker.candidate = worker.ops.create(worker.staged, worker.before)
        worker.ops.verify_target(worker.before, worker.candidate)
        return worker.candidate

    def stop(self):
        worker = self.worker
        worker.guard(worker.req["cutoff"])
        need(worker.candidate is not None and not worker.stop_attempted
             and worker.clock() + worker.req["stopAdmissionSeconds"] < worker.req["cutoff"]
             and worker.observe_closed() == "RUNNING_BASELINE_CLOSED", "POST_STAGE_STOP_ADMISSION_DRIFT")
        worker.ops.verify_target(worker.before, worker.candidate)
        self.claim("stop-baseline")
        worker.stop_attempted = True
        worker.ops.stop_once(worker.before["Id"])
        worker.closed_instance = worker.ops.stopped_instance(worker.ops.baseline(worker.before["Id"]))
        return worker.observe_closed()

    def forward_matches(self, plan):
        req = self.worker.req
        return all(plan[key] == req[key] for key in ("leaseId", "executionId", "planSHA256")) and (
            plan["frameSHA256"] == req["effectiveSQLSHA256"]
            and plan["wireSHA256"] == req["wireSHA256"]
        )

    def start(self, plan, ledger, ack, readback, now, *, reader="postgres"):
        need(self.forward_matches(plan)
             and self.writer.view()["v5-forward"] == "CLAIMED"
             and sql_terminal(plan, ledger, ack, readback, now, reader=reader) == "ACK_TERMINAL_POSTIMAGE",
             "TARGET_REQUIRES_EXACT_ACK_AND_POSTIMAGE")
        self.claim("start-candidate")
        return self.worker.start_target()

    def contain(self):
        self.claim("stop-candidate")
        return self.worker.contain()

    def recover(self, plan, ledger, ack, readback, evidence, now):
        if (not self.forward_matches(plan) or self.worker.restore_attempted
                or self.writer.view()["accept-candidate"] != "UNCLAIMED"
                or self.writer.view()["v5-inverse"] != "UNCLAIMED"):
            return "RECONCILE_ONLY"
        if choose(self.clock, plan, ledger, ack, readback, evidence, now) != "KEEP_V5_RESTORE_IMAGE127_CLOSED_ONCE":
            return "RECONCILE_ONLY"
        self.claim("restore-baseline")
        return self.worker.restore()

    def verify_restored(self):
        need(self.worker.restore_attempted, "BASELINE_RESTORE_UNOBSERVED")
        self.worker.ops.verify_running(self.worker.before["Id"], self.worker.before, False, self.clock["hardEnd"])
