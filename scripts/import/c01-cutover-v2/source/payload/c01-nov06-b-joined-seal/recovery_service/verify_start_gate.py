"""Bound the existing verification runner's start without taking a second lock."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

LEDGER = Path("/var/lib/otr/root2-c01-maintenance")
RUNTIME = Path("/run/otr/root2-c01-keep-v5")


def private(path, mode):
    if path.resolve() != path:
        raise ValueError("VERIFY_LAUNCH_PATH_DRIFT")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        row = os.fstat(stream.fileno())
        if (not stat.S_ISREG(row.st_mode) or row.st_uid != 0 or row.st_gid != 0
                or row.st_nlink != 1 or stat.S_IMODE(row.st_mode) != mode or row.st_size > 262144):
            raise ValueError("VERIFY_LAUNCH_FILE_DRIFT")
        return stream.read(262144)


def start_at(plan, role, now):
    t = plan["T"]
    verify = plan["verification"]
    if (plan["version"] != "VERIFY_AND_ROLLBACK" or type(t) is not int
            or verify["keeperAt"] != t + 600 or verify["hardEnd"] != t + 1200):
        raise ValueError("VERIFY_LAUNCH_CLOCK_DRIFT")
    due = t if role == "dispatch" else verify["keeperAt"]
    return due <= now < due + 30


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("role", choices=("dispatch", "keeper"))
    cli.add_argument("execution")
    cli.add_argument("plan_sha")
    cli.add_argument("runner_sha")
    args = cli.parse_args()
    if os.geteuid() != 0 or not re.fullmatch(r"[0-9a-f]{32}", args.execution):
        raise ValueError("VERIFY_LAUNCH_IDENTITY_DRIFT")
    ledger = LEDGER / args.execution
    plan_path = ledger / "plan.json"
    payload = private(plan_path, 0o400)
    plan = json.loads(payload)
    if hashlib.sha256(payload).hexdigest() != args.plan_sha or plan["executionId"] != args.execution:
        raise ValueError("VERIFY_LAUNCH_PLAN_DRIFT")
    arm = json.loads(private(ledger / "arm-verified.json", 0o600))
    if (arm != json.loads(private(ledger / "arm.json", 0o600))
            or arm["planSHA256"] != args.plan_sha or arm["T"] != plan["T"]):
        raise ValueError("VERIFY_LAUNCH_ARM_DRIFT")
    runner = RUNTIME / args.execution / "payload/c01-nov06-b-joined-seal/recovery_service/verify_and_rollback.py"
    if hashlib.sha256(private(runner, 0o400)).hexdigest() != args.runner_sha:
        raise ValueError("VERIFY_LAUNCH_RUNNER_DRIFT")
    if not start_at(plan, args.role, time.time()):
        raise ValueError("VERIFY_LAUNCH_START_OUTSIDE_BOUND")
    os.execv("/usr/bin/python3", ["/usr/bin/python3", "-B", str(runner), args.role,
                                str(plan_path), args.plan_sha])


if __name__ == "__main__":
    main()
