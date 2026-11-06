"""Host operations for the reviewed closed V5 window."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time

from caddy_admin_cas import CONFIG_ROOT, admin_cas_request
from cutover_read_aperture import TABLE, binding_valid, caddy_config, nft_rules, proof_pins, replace_handler, servers_cas
from controls import can_stop, config_sha, route_plan
from dev_host_worker import DEFAULT, need
from joined_host_keep_v5 import create_target, verify_target
from keep_v5_choice import LEGACY_COMPAT_SHA256
from preserve_import_routes import route_after_maintenance
from stage_writer import BASELINE, TARGET


DOCKER = "/usr/bin/docker"
DOCKER_SOCKET = "/run/docker.sock"
CADDY_SOCKET = "/run/caddy-admin/admin.sock"


def run(args, timeout=6, payload=None):
    result = subprocess.run(
        args, input=payload, capture_output=True, timeout=timeout, check=False,
        env={"PATH": "/usr/bin:/bin", "DOCKER_CONFIG": "/proc/self/fd"},
    )
    need(result.returncode == 0, "FIXED_HOST_COMMAND_UNCONFIRMED")
    return result.stdout


def fingerprint(row):
    mount_keys = ("Source", "Destination", "RW", "Type", "Propagation")
    return config_sha({
        "config": row["Config"], "hostConfig": row["HostConfig"],
        "mounts": sorted(
            (tuple(mount.get(key) for key in mount_keys) for mount in row["Mounts"]),
            key=lambda mount: mount[1],
        ),
    })


def root_file(path, max_bytes, modes=(0o400, 0o600)):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, "UNSAFE_HOST_INPUT_PATH")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
             and stat.S_IMODE(info.st_mode) in modes and info.st_size <= max_bytes,
             "UNSAFE_HOST_INPUT_FILE")
        raw = stream.read(max_bytes + 1)
        need(len(raw) <= max_bytes, "HOST_INPUT_FILE_OVERSIZE")
        return raw


class DockerOps:
    def __init__(self, host):
        self.host = host

    def docker(self, *args, timeout=6):
        return run([DOCKER, "--host", "unix://" + DOCKER_SOCKET, *args], timeout)

    def lookup(self, name):
        need(re.fullmatch(r"[a-z0-9-]{1,96}", name), "UNSAFE_CONTAINER_NAME")
        names = self.docker("ps", "-a", "--no-trunc", "--format", "{{.Names}}").decode().splitlines()
        if name not in names:
            return None
        row, = json.loads(self.docker("inspect", "--type", "container", name))
        need(row["Name"] == "/" + name, "CONTAINER_NAME_DRIFT")
        return row

    def inspect(self, cid):
        need(re.fullmatch(r"[a-f0-9]{64}", cid), "UNSAFE_CONTAINER_ID")
        row, = json.loads(self.docker("inspect", "--type", "container", cid))
        need(row["Id"] == cid, "CONTAINER_ID_DRIFT")
        return row

    def baseline(self, cid):
        need(cid == self.host["baselineCID"], "BASELINE_ID_DRIFT")
        row = self.inspect(cid)
        need(row["Image"] == BASELINE and fingerprint(row) == self.host["baselineFingerprintSHA256"],
             "BASELINE_CONFIGURATION_DRIFT")
        return row

    def running_baseline(self):
        row = self.baseline(self.host["baselineCID"])
        need(row["Name"] == "/" + DEFAULT and row["State"]["Running"]
             and row["State"]["StartedAt"] == self.host["baselineStartedAt"]
             and row["State"]["Health"]["Status"] == "healthy", "BASELINE_RUNNING_IDENTITY_DRIFT")
        return row

    def assert_timers_closed(self):
        raw = run(["/usr/bin/systemctl", "list-units", "--all", "--plain", "--no-legend",
                   "--type=timer", "--state=active"])
        prefixes = (b"otr-mcp-", b"otr-auth-", b"otr-universal-finite-")
        need(not any(row.strip().startswith(prefixes) for row in raw.splitlines()),
             "PROTECTED_TIMER_ACTIVE")

    def target_present(self):
        return self.docker("image", "inspect", TARGET, "--format", "{{.Id}}").decode().strip() == TARGET

    def create(self, name, baseline):
        return create_target(DOCKER_SOCKET, name, baseline)

    def verify_target(self, baseline, cid):
        verify_target(baseline, self.inspect(cid), cid)

    @staticmethod
    def stopped_instance(row):
        need(row["State"]["Running"] is False, "STOP_OUTCOME_UNKNOWN")
        return tuple(row["State"][key] for key in ("StartedAt", "FinishedAt", "ExitCode"))

    def stop_once(self, cid):
        self.docker("stop", "--time", "10", cid, timeout=16)
        self.stopped_instance(self.inspect(cid))

    def rename(self, cid, name):
        need(re.fullmatch(r"[a-z0-9-]{1,96}", name), "UNSAFE_CONTAINER_NAME")
        self.docker("rename", cid, name)

    def start(self, cid):
        self.docker("start", cid, timeout=16)

    def verify_running(self, cid, baseline, target, deadline):
        until = min(deadline, time.time() + 60)
        while time.time() < until:
            self.assert_timers_closed()
            row = self.inspect(cid)
            if target:
                self.verify_target(baseline, cid)
            else:
                self.baseline(cid)
            need(row["Name"] == "/" + DEFAULT and row["State"]["Running"], "RUNNING_INSTANCE_DRIFT")
            if row["State"]["Health"]["Status"] == "healthy":
                pins = self.host["targetBundlePins" if target else "baselineBundlePins"]
                need(len(pins) == 4, "EXACT_BUNDLE_SET_REQUIRED")
                for name, digest in pins.items():
                    need(re.fullmatch(r"[A-Za-z0-9._/-]+", name) and ".." not in Path(name).parts
                         and not name.startswith("/"), "UNSAFE_BUNDLE_PATH")
                    actual = self.docker("exec", cid, "sha256sum", "/app/" + name).split()[0].decode()
                    need(actual == digest, "BUNDLE_DIGEST_DRIFT")
                conn = http.client.HTTPConnection("127.0.0.1", 8787, timeout=3)
                try:
                    conn.request("GET", "/health")
                    need(conn.getresponse().status == 200, "BACKEND_HEALTH_REFUSED")
                finally:
                    conn.close()
                current = self.inspect(cid)
                need(current["State"]["StartedAt"] == row["State"]["StartedAt"]
                     and current["State"]["Running"] and time.time() < until, "RUNNING_INSTANCE_DRIFT")
                return
            time.sleep(0.2)
        raise ValueError("BACKEND_HEALTH_DEADLINE")


def caddy(path, method="GET", headers=None, body=None):
    need(stat.S_ISSOCK(Path(CADDY_SOCKET).lstat().st_mode), "CADDY_ADMIN_SOCKET_UNBOUND")
    with tempfile.NamedTemporaryFile() as capture:
        args = ["/usr/bin/curl", "--disable", "--silent", "--max-time", "5",
                "--unix-socket", CADDY_SOCKET, "--dump-header", capture.name, "--request", method]
        for key, value in (headers or {}).items():
            args.extend(["--header", key + ": " + value])
        if body is not None:
            args.extend(["--data-binary", "@-"])
        raw = run([*args, "http://localhost" + path], payload=body)
        capture.seek(0)
        lines = capture.read(65537).decode("ascii").splitlines()
        status = int(lines[0].split()[1])
        etags = [line.partition(": ")[2] for line in lines if line.lower().startswith("etag: ")]
        need(len(raw) <= 1048576 and len(etags) <= 1, "CADDY_REPLY_UNCONFIRMED")
        return status, etags[0] if etags else None, raw


class HostAdapter:
    def __init__(self, plan, writer):
        self.plan, self.writer = plan, writer
        self.host = plan["host"]
        self.ops = DockerOps(self.host)
        # Only the non-secret Caddy handler delta is put in the sealed plan.
        self.route = self.host["caddyFence"]
        self.import_route = self.host["caddyImportFence"]

    def _evidence(self, phase):
        # The owning observer is a separately reviewed, hash-bound read-only executable.
        observer = self.host["owningObserver"]
        payload = root_file(observer["path"], 262144, modes=(0o400,))
        need(hashlib.sha256(payload).hexdigest() == observer["sha256"], "OWNING_OBSERVER_DRIFT")
        self.writer.assert_current(self.writer.ledger)
        result = json.loads(run(["/usr/bin/python3", "-I", "-B", "-", phase,
                                 self.plan["executionId"], self.plan["leaseId"],
                                 self.plan["planSHA256"]], payload=payload))
        now = int(time.time())
        need(result.get("executionId") == self.plan["executionId"]
             and result.get("leaseId") == self.plan["leaseId"]
             and result.get("phase") == phase
             and result.get("planSHA256") == self.plan["planSHA256"]
             and type(result.get("observedAt")) is int and 0 <= now - result["observedAt"] <= 5,
             "OWNING_EVIDENCE_UNBOUND")
        self.writer.assert_current(self.writer.ledger)
        return result

    def _config(self):
        status, etag, raw = caddy(CONFIG_ROOT)
        need(status == 200 and etag is not None, "CADDY_PREIMAGE_UNCONFIRMED")
        return etag, raw

    def _patch(self, route):
        etag, raw = self._config()
        method, path, headers, body = admin_cas_request(route, raw, etag)
        status, _, _ = caddy(path, method, headers, json.dumps(body).encode())
        need(status == 200, "CADDY_PATCH_UNKNOWN")
        _, observed = self._config()
        return config_sha(json.loads(observed)) == route["fenced"]

    def preflight(self):
        self.ops.assert_timers_closed()
        self.ops.running_baseline()
        _, raw = self._config()
        original = json.loads(raw)
        need(self.route == route_plan(original) and self.import_route == route_after_maintenance(original),
             "CADDY_ROUTE_PLAN_DRIFT")
        proof = self._evidence("preflight")
        return self.ops.target_present() and proof.get("ready") is True

    def fence(self):
        return self._patch(self.route)

    def verify_fence(self):
        _, raw = self._config()
        return config_sha(json.loads(raw)) == self.route["fenced"]

    def drain(self):
        return self.verify_fence() and can_stop(self._evidence("drain")["drain"])

    def verify_preserved(self, cid):
        proof = self._evidence("preservation")
        return proof.get("cid") == cid and proof.get("preserved") is True and proof.get("ordinaryRead") is True

    def open_import_fenced(self):
        return self._patch(self.import_route)

    def verify_import_fence(self):
        _, raw = self._config()
        return config_sha(json.loads(raw)) == self.import_route["fenced"]

    def can_contain(self, cid):
        proof = self._evidence("contain")
        return self.verify_fence() and proof.get("cid") == cid and proof.get("canContain") is True

    def observe_recovery(self):
        need(self.verify_fence(), "RECOVERY_FENCE_UNPROVED")
        proof = self._evidence("recovery")
        need(proof.get("legacyCompatibilitySHA256") == LEGACY_COMPAT_SHA256,
             "RECOVERY_COMPATIBILITY_UNPROVED")
        return proof

    def observe_no_send_recovery(self):
        need(self.verify_fence(), "RECOVERY_FENCE_UNPROVED")
        return self._evidence("no-send-recovery")


class CompositeHostAdapter(HostAdapter):
    def __init__(self, plan, writer):
        super().__init__(plan, writer)
        self.aperture = self.host["aperture"]
        binding_valid(self.aperture)

    def _caddy_owner(self):
        raw = run(["/usr/bin/systemctl", "show", "caddy.service",
                   "--property=ActiveState,MainPID,ControlGroup,Restart"]).decode()
        state = dict(line.split("=", 1) for line in raw.splitlines())
        pid = int(state["MainPID"])
        proc = Path("/proc") / str(pid)
        ticks = int((proc/"stat").read_text().rsplit(")", 1)[1].split()[19])
        need(state["ActiveState"] == "active" and state["Restart"] == "no" and [pid, ticks] == self.aperture["caddyPidStart"]
             and state["ControlGroup"] == "/" + self.aperture["caddyCgroup"]
             and proc.stat().st_uid == self.aperture["caddyUid"], "C01_CADDY_SOCKET_OWNER_DRIFT")

    def _nft_absent(self):
        raw = run(["/usr/sbin/nft", "-j", "list", "tables"])
        tables = (item["table"] for item in json.loads(raw)["nftables"] if "table" in item)
        return not any(table["family"] == "inet" and table["name"] == TABLE for table in tables)

    def _verify_nft(self):
        self._caddy_owner()
        raw = run(["/usr/sbin/nft", "-j", "-s", "list", "table", "inet", TABLE])
        rows = [row for row in json.loads(raw)["nftables"] if "metainfo" not in row]
        for row in rows:
            for value in row.values():
                value.pop("handle", None)
        return config_sha(rows) == self.aperture["nftSHA256"]

    def _set_servers(self, before, after, after_sha):
        self.writer.assert_current(self.writer.ledger)
        need(config_sha(after) == after_sha, "C01_COMPOSITE_POSTIMAGE_PIN_DRIFT")
        etag, raw = self._config()
        path, headers, body = servers_cas(raw, etag, before, after)
        status, _, _ = caddy(path, "PATCH", headers, json.dumps(body).encode())
        need(status == 200, "C01_COMPOSITE_CADDY_ACK_UNKNOWN")
        _, post = self._config()
        return config_sha(json.loads(post)) == after_sha

    def _fenced_config(self, original):
        full = replace_handler(original, self.route, "forward")
        sealed = caddy_config(full, self.route["fenced"], self.aperture["oldReads"])
        scoped = replace_handler(sealed, self.import_route, "forward")
        need(config_sha(sealed) == self.aperture["fullSHA256"]
             and config_sha(scoped) == self.aperture["scopedSHA256"],
             "C01_COMPOSITE_ROUTE_PINS_DRIFT")
        return sealed

    def preflight(self):
        self._caddy_owner()
        need(self._nft_absent(), "C01_APERTURE_TABLE_ALREADY_PRESENT")
        _, raw = self._config()
        self._fenced_config(json.loads(raw))
        return super().preflight()

    def fence(self):
        self._caddy_owner()
        need(self._nft_absent(), "C01_APERTURE_TABLE_ALREADY_PRESENT")
        _, raw = self._config()
        sealed = self._fenced_config(json.loads(raw))
        need(self._set_servers(self.route["before"], sealed, self.aperture["fullSHA256"]),
             "C01_COMPOSITE_CADDY_FENCE_UNPROVED")
        self._caddy_owner()
        need(self._nft_absent(), "C01_APERTURE_TABLE_ALREADY_PRESENT")
        rules = nft_rules(self.aperture["caddyUid"], self.aperture["caddyCgroup"])
        run(["/usr/sbin/nft", "-f", "-"], payload=rules.encode())
        return self.verify_fence()

    def _composite(self, phase_sha):
        self.writer.assert_current(self.writer.ledger)
        _, raw = self._config()
        return config_sha(json.loads(raw)) == phase_sha and self._verify_nft()

    def verify_fence(self):
        return self._composite(self.aperture["fullSHA256"])

    def verify_preserved(self, cid):
        return self.verify_fence() and super().verify_preserved(cid)

    def open_import_fenced(self):
        need(self.verify_fence(), "C01_COMPOSITE_FENCE_UNPROVED")
        _, raw = self._config()
        after = replace_handler(json.loads(raw), self.import_route, "forward")
        return self._set_servers(self.aperture["fullSHA256"], after, self.aperture["scopedSHA256"])

    def release_proof(self):
        need(self._composite(self.aperture["scopedSHA256"]), "C01_COMPOSITE_RELEASE_UNPROVED")
        row = self.ops.lookup(DEFAULT)
        need(row is not None and row["State"]["Running"], "C01_RELEASE_SERVICE_UNPROVED")
        original = self.ops.baseline(self.host["baselineCID"])
        self.ops.verify_running(row["Id"], original, row["Image"] == TARGET, self.plan["T"] + 1200)
        proof = self._evidence("reopen")
        need(proof.get("cid") == row["Id"] and proof.get("preserved") is True
             and proof.get("ordinaryRead") is True
             and self._composite(self.aperture["scopedSHA256"]), "C01_RELEASE_PRESERVATION_UNPROVED")
        return proof_pins(self.aperture)


def build(plan, writer):
    return CompositeHostAdapter(plan, writer)
