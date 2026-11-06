"""Offline recovery choice. It has no Host or PostgreSQL transport."""
from render_joined import RECOVERY_BUDGET
from stage_writer import BASELINE, TARGET, joined_binding
from terminal_policy import sql_terminal

LEGACY_COMPAT_SHA256 = "de84ec2637cf01aba03517a2344783f1bfa15026059c27157d90db5f5f36e70f"
REMAINING = sum(RECOVERY_BUDGET[phase] for phase in (
    "restoreNames", "baselineHealth", "independentOldRead", "publicRestore", "slack",
))


def choose(clock, plan, ledger, ack, readback, evidence, now, *, reader="postgres"):
    start = clock.get("T")
    if type(start) is not int or start <= 0 or clock != joined_binding(start, BASELINE, TARGET):
        return "RECONCILE_ONLY"
    if (type(now) is not int or not clock["T"] <= now
            or now + REMAINING >= clock["hardEnd"]
            or evidence.get("leaseId") != plan["leaseId"]
            or evidence.get("planSHA256") != plan["planSHA256"]
            or type(evidence.get("observedAt")) is not int
            or not 0 <= now - evidence["observedAt"] <= 5
            or evidence.get("legacyCompatibilitySHA256") != LEGACY_COMPAT_SHA256
            or evidence.get("durableAcceptance") != "NOT_ACCEPTED"
            or evidence.get("inverseIntent") != "UNCLAIMED"
            or not all(evidence.get(key) is True for key in (
                "targetFailureTerminal", "candidateContained", "bClosedSinceStart",
                "zeroBEffects", "knownWorkDrained", "baselineRestoreReady",
                "noUnknownHostAction",
            ))
            or sql_terminal(plan, ledger, ack, readback, now, reader=reader) != "ACK_TERMINAL_POSTIMAGE"):
        return "RECONCILE_ONLY"
    return "KEEP_V5_RESTORE_IMAGE127_CLOSED_ONCE"
