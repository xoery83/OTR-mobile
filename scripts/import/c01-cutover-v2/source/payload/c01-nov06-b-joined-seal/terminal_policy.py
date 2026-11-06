"""Offline terminal and recovery admission policy. No session or action transport."""
from render_joined import PROPOSED, RECOVERY_BUDGET

def sql_terminal(plan, ledger, ack, readback, now, *, reader="postgres"):
    if (reader not in ("postgres", "otr_c01_v5_recovery_reader")
            or ledger.get("leaseId") != plan["leaseId"] or ledger.get("planSHA256") != plan["planSHA256"]
            or readback.get("leaseId") != plan["leaseId"]
            or readback.get("executionId") != plan["executionId"]
            or readback.get("principal") != reader
            or readback.get("fullVisibility") is not True
            or type(readback.get("backendPid")) is not int or readback["backendPid"] <= 0
            or type(readback.get("tagCount")) is not int or readback["tagCount"] != 0
            or type(readback.get("observedAt")) is not int
            or not 0 <= now - readback["observedAt"] <= 5):
        return "RECONCILE_ONLY"
    if (ledger.get("intent") == "UNCLAIMED" and ledger.get("dispatcherExcluded") is True
            and ack is None and readback.get("catalogSHA256") == plan["preimageSHA256"]):
        return "NO_SEND_PREIMAGE"
    if (ledger.get("intent") != "CLAIMED"
            or ledger.get("wireSHA256") != plan["wireSHA256"]
            or not isinstance(ack, dict)
            or any(ack.get(k) != plan[k] for k in ("executionId", "frameSHA256"))
            or ack.get("principal") != "postgres"
            or ack.get("tagReset") is not True
            or type(ack.get("backendPid")) is not int or ack["backendPid"] <= 0
            or type(ack.get("observedAt")) is not int
            or readback["backendPid"] == ack["backendPid"]
            or readback["observedAt"] < ack["observedAt"]
            or readback.get("catalogSHA256") != plan["postimageSHA256"]):
        return "RECONCILE_ONLY"
    return "ACK_TERMINAL_POSTIMAGE"

def recovery_admission(start, now, completed, *, holder, durable_acceptance, unknown_action):
    # The caller supplies only independently proven, ordered terminal phases.
    stages = tuple(RECOVERY_BUDGET)[:-1]
    if (holder not in ("main", "backup") or type(start) is not int or type(now) is not int
            or durable_acceptance not in ("NOT_ACCEPTED", "ACCEPTED")
            or unknown_action is not False or type(completed) is not tuple
            or completed != stages[:len(completed)]):
        return "RECONCILE_ONLY"
    due = "recoveryAt" if holder == "main" else "backupAt"
    if now < start + PROPOSED[due]:
        return "NOT_DUE"
    if durable_acceptance == "ACCEPTED":
        return "RECONCILE_ACCEPTED_ROUTE_ONLY"
    pending = stages[len(completed):]
    if not pending:
        return "INDEPENDENT_CLOSE_READBACK"
    if ("inverse" in pending and now + sum(RECOVERY_BUDGET[s] for s in pending[:pending.index("inverse")+1])
            > start + PROPOSED["inverseSQLComplete"]):
        return "RECONCILE_ONLY"
    if now + sum(RECOVERY_BUDGET[s] for s in pending) >= start + PROPOSED["hardEnd"]:
        return "RECONCILE_ONLY"
    return "ADMIT_NEXT_BOUND_STEP"
