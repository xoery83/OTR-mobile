"""Reconstruct the narrow closed restore action under the joined Writer."""
import time

from dev_host_worker import DEFAULT, HostWorker, need
from keep_v5_choice import REMAINING, choose
from controls import keeper_decision
from stage_writer import BASELINE, TARGET, joined_binding


class RetainedRestore(HostWorker):
    def __init__(self, request, writer, ops, before, stopped, candidate):
        # Restore must consume the original stopped instance, never infer it from
        # the current container after the controller has disappeared.
        self.req, self.lease, self.ops = request, writer, ops
        self.clock = time.time
        self.before, self.closed_instance, self.candidate = before, stopped, candidate
        self.stop_attempted, self.restore_attempted = True, False
        self.backup = "otr-c01-retained-" + request["executionId"]
        self.staged = "otr-c01-candidate-" + request["executionId"]
        need(before["Id"] == request["baselineCID"] and before["Image"] == BASELINE,
             "RESTORE_BASELINE_IDENTITY_DRIFT")


def take_over(host, role, plan, ack, observe, *, reader="postgres"):
    """The owner of the flock supplies fresh, independently bound observations."""
    need(role in ("main", "backup"), "EXACT_KEEPER_ROLE_REQUIRED")
    req, writer = host.req, host.lease
    clock = joined_binding(req["T"], BASELINE, TARGET)
    need(req["D"] == clock["hardEnd"] and
         all(plan[k] == req[k] for k in ("leaseId", "executionId", "planSHA256")) and
         plan["frameSHA256"] == writer.pins["v5-forward"], "RESTORE_PLAN_DRIFT")
    due = clock["recoveryAt" if role == "main" else "backupAt"]
    if host.clock() < due:
        return "NOT_DUE"
    view = writer.view()
    if (writer.unresolved() or view["accept-candidate"] != "UNCLAIMED" or
            view["v5-inverse"] != "UNCLAIMED" or view["v5-forward"] != "CLAIMED"):
        return "RECONCILE_ONLY"
    if view["restore-baseline"] == "CLAIMED":
        return "VERIFY_BASELINE_BEFORE_INGRESS"
    if host.candidate is not None:
        candidate = host.ops.lookup(host.staged) or host.ops.lookup(DEFAULT)
        if candidate is None or candidate["Id"] != host.candidate or candidate["State"]["Running"]:
            return "RECONCILE_ONLY"
        host.ops.verify_target(host.before, host.candidate)
    need(host.observe_closed() == "STOPPED_CLOSED", "RESTORE_STOPPED_STATE_REQUIRED")
    readback, evidence = observe()
    now = int(host.clock())
    ledger = dict(leaseId=req["leaseId"], planSHA256=req["planSHA256"],
                  intent=view["v5-forward"], wireSHA256=plan["wireSHA256"])
    verdict = keeper_decision(now, due, req["D"], prior_intents_resolved=True,
                              accepted=False, candidate_running=False, baseline_running=False,
                              fence_closed=evidence.get("bClosedSinceStart") is True,
                              remaining_budget=REMAINING)
    if (verdict != "RESTORE_BASELINE_ONCE" or
            choose(clock, plan, ledger, ack, readback, evidence, now, reader=reader)
            != "KEEP_V5_RESTORE_IMAGE127_CLOSED_ONCE"):
        return "RECONCILE_ONLY"
    host.guard()
    writer.claim("restore-baseline", writer.pins["restore-baseline"])
    host.restore()
    host.ops.verify_running(host.before["Id"], host.before, False, req["D"])
    return "BASELINE_CLOSED_HEALTHY"
