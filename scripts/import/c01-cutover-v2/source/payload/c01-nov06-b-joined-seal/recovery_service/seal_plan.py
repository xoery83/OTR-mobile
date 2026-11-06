"""Render an offline execution plan from already authorized DEV bindings."""
import argparse
import ipaddress
import json
import os
from pathlib import Path

from dispatcher import BASELINE_CID, HEX32, HEX64, LEDGER_ROOT, LOCK, VERSION, dump, require, sha
from dev_commit_ack import render
from cutover_read_aperture import binding_valid
from pg_readback import DEV_HOST, DEV_PROJECT
from render_joined import PROPOSED, build_at_cutoff, fixed_preimage


def seal(binding):
    keys = {"executionId", "leaseId", "T", "lock", "ledger", "host", "pgReadback", "forwardPassFile"}
    require(set(binding) == keys, "EXACT_INPUT_FIELDS_REQUIRED")
    execution_id, lease_id = binding["executionId"], binding["leaseId"]
    require(HEX32.fullmatch(execution_id) and HEX32.fullmatch(lease_id) and execution_id != lease_id,
            "EXACT_OPERATION_IDS_REQUIRED")
    start = binding["T"]
    require(type(start) is int and 0 < start < 4102444800, "INVALID_WINDOW_CLOCK")
    for key, path in (("lock", LOCK), ("ledger", LEDGER_ROOT / execution_id)):
        resource = binding[key]
        require(set(resource) == {"path", "identity"} and resource["path"] == str(path)
                and type(resource["identity"]) is list and len(resource["identity"]) == 2
                and all(type(n) is int and n >= 0 for n in resource["identity"]),
                "HOST_RESOURCE_IDENTITY_REQUIRED")
    host = binding["host"]
    binding_valid(host["aperture"])
    require(host["baselineCID"] == BASELINE_CID and HEX64.fullmatch(host["baselineFingerprintSHA256"])
            and host["stopAdmissionSeconds"] == 30 and host["healthReserveSeconds"] == 60,
            "BASELINE_OR_WINDOW_LIMIT_DRIFT")
    require(isinstance(host["baselineStartedAt"], str) and bool(host["baselineStartedAt"])
            and type(host.get("allowNoSendRestore", False)) is bool, "HOST_RUNTIME_BINDING_REQUIRED")
    for key in ("baselineBundlePins", "targetBundlePins"):
        pins = host[key]
        require(isinstance(pins, dict) and len(pins) == 4
                and all(HEX64.fullmatch(digest) for digest in pins.values()),
                "FIXED_BUNDLE_PINS_REQUIRED")
    for key in ("caddyFence", "caddyImportFence"):
        route = host[key]
        require(set(route) == {"path", "before", "fenced", "forward", "reverse"}
                and HEX64.fullmatch(route["before"]) and HEX64.fullmatch(route["fenced"]),
                "FIXED_ROUTE_PINS_REQUIRED")
    require(host["caddyFence"]["path"] == host["caddyImportFence"]["path"]
            and host["caddyFence"]["fenced"] == host["caddyImportFence"]["before"],
            "CADDY_FENCE_CHAIN_DRIFT")
    observer = host["owningObserver"]
    require(set(observer) == {"path", "sha256"} and Path(observer["path"]).is_absolute()
            and HEX64.fullmatch(observer["sha256"]), "BOUND_OWNING_OBSERVER_REQUIRED")
    forward = Path(binding["forwardPassFile"])
    pg = binding["pgReadback"]
    reader = Path(pg["credentialSourceFile"])
    require(forward.is_absolute() and reader.is_absolute() and forward != reader,
            "INDEPENDENT_CREDENTIAL_PATHS_REQUIRED")
    ipaddress.ip_address(pg["serverAddress"])
    require(pg["host"] == DEV_HOST and pg["port"] == 5432 and pg["database"] == "postgres"
            and ipaddress.ip_address(pg["connectAddress"]).is_global
            and pg["systemIdentifier"].isdigit() and 0 < len(pg["systemIdentifier"]) <= 20
            and Path(pg["rootCertificateFile"]).is_absolute()
            and HEX64.fullmatch(pg["rootCertificateSHA256"]), "FIXED_DEV_PG_BINDING_REQUIRED")
    before, after = fixed_preimage()
    frame = build_at_cutoff(before, after, start + PROPOSED["forwardSQLComplete"], execution_id)
    sql = {"frameSHA256": sha(frame), "wireSHA256": sha(render(frame, execution_id)),
           "preimageSHA256": sha(dump(before)), "postimageSHA256": sha(dump(after)),
           "forwardPassFile": str(forward)}
    return {**{k: v for k, v in binding.items() if k != "forwardPassFile"},
            "version": VERSION, "project": DEV_PROJECT, "sql": sql}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bindings", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    raw = dump(seal(json.loads(args.bindings.read_bytes()))) + b"\n"
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, "wb") as out:
        out.write(raw)
        out.flush()
        os.fsync(out.fileno())
    print(sha(raw))
