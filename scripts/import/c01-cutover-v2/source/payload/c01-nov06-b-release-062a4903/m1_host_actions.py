"""M1's fixed Caddy, Docker and PDF actions, with a sealed owning isolation port."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
PAYLOAD = HERE.parent if HERE.name == "c01-nov06-b-release-062a4903" else HERE / "payload"
JOIN = PAYLOAD / "c01-nov06-b-joined-seal"
for dependency in (PAYLOAD / "c01-nov06-b-image-only-offline", JOIN, JOIN / "recovery_service"):
    sys.path.insert(0, str(dependency))

from caddy_admin_cas import CONFIG_ROOT
from controls import config_sha, route_plan
from cutover_read_aperture import APERTURE, replace_handler
from dev_host_worker import need
from host_adapter import CADDY_SOCKET, DOCKER_SOCKET, CompositeHostAdapter, DockerOps, caddy, fingerprint
from host_target_binding import (CONTINUOUS_HOST, RUNTIME_DEST, create_exact_target, create_from_payload,
                                 legacy_recovery_projection, m1_create_host_config, mount_projection,
                                 target_payload, verify_target)
from m1_host_entry import load
from preserve_import_routes import route_after_maintenance

PDF = "otr-universal-pdf-worker.service"
SOCKET = Path("/run/otr/universal-pdf-worker/worker.sock")
SYSTEMCTL = "/usr/bin/systemctl"
PROC = Path("/proc")
FIELDS = "LoadState,ActiveState,SubState,MainPID,Restart,FragmentPath,ExecStart"


def systemctl(*args, timeout=8, check=True):
    result = subprocess.run([SYSTEMCTL, *args], capture_output=True, text=True,
                            timeout=timeout, check=False, env={"PATH": "/usr/bin:/bin"})
    need(not check or result.returncode == 0, "M1_PDF_SYSTEMD_UNCONFIRMED")
    return result


def pdf_job_queue_empty():
    result = systemctl("--system", "--no-pager", "--no-legend", "--full", "list-jobs", PDF, check=False)
    return result.returncode == 0 and not result.stdout.strip() and not result.stderr.strip()


def pdf_state():
    rows = dict(line.split("=", 1) for line in systemctl("show", PDF, "--property=" + FIELDS).stdout.splitlines())
    unit = Path(rows.pop("FragmentPath"))
    need(unit == Path("/etc/systemd/system") / PDF and unit.resolve() == unit,
         "M1_PDF_UNIT_PATH_DRIFT")
    info = unit.stat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
         and stat.S_IMODE(info.st_mode) == 0o644, "M1_PDF_UNIT_PREIMAGE_DRIFT")
    command, = re.findall(r"argv\[\]=([^;]+);", rows.pop("ExecStart"))
    paths = (Path(item) for item in shlex.split(command))
    rows["entrypoints"] = [{"basename": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                           for p in paths if p.is_absolute() and (p.name == "node" or p.suffix in (".js", ".mjs"))]
    rows["unitSHA256"] = hashlib.sha256(unit.read_bytes()).hexdigest()
    return rows


def pdf_socket_owned(pid):
    try:
        socket = SOCKET.lstat()
        if not stat.S_ISSOCK(socket.st_mode) or (socket.st_uid, socket.st_gid, stat.S_IMODE(socket.st_mode)) != (0, 999, 0o660):
            return False
        rows = [line.split() for line in (PROC / "net/unix").read_text().splitlines()[1:]]
        listeners = {f"socket:[{r[6]}]" for r in rows if len(r) == 8 and r[7] == str(SOCKET)
                     and r[3:6] == ["00010000", "0001", "01"]}
        if len(listeners) != 1:
            return False
        return any(str(fd.readlink()) in listeners for fd in (PROC / str(pid) / "fd").iterdir()
                   if fd.is_symlink()) and (post := SOCKET.lstat()).st_ino == socket.st_ino and post.st_dev == socket.st_dev
    except (FileNotFoundError, ProcessLookupError):
        return False


class M1HostActions(DockerOps):
    def __init__(self, request, host, lease, pins, isolation):
        self.resume = request["resumedBaseline"]
        self.continuous_preimage = "disabled" if self.resume else "enabled"
        super().__init__({
            "baselineCID": host["baselineCID"], "baselineFingerprintSHA256": host["baselineConfigSHA256"],
            "baselineStartedAt": host["baselineStartedAt"] if self.resume else pins["baselineStartedAt"],
            "baselineBundlePins": pins["baselineBundlePins"],
            "targetBundlePins": pins["targetBundlePins"],
        })
        self.request, self.lease, self.host_pins, self.isolation = request, lease, host, isolation
        need(request["candidateContinuousHost"] == "disabled", "M1_CONTINUOUS_SELECTOR_REQUIRED")
        self.target = request["targetImage"]
        self.caddy_socket_identity = pins["caddySocketIdentity"]
        self.aperture_pins = pins["aperture"]
        need(self.aperture_pins["oldReads"] == [], "M1_APERTURE_HEALTH_ONLY_REQUIRED")
        self.task_path = Path(pins["taskStorePath"])
        need(self.task_path.is_absolute() and self.task_path.resolve() == self.task_path,
             "M1_TASK_STORE_PATH_DRIFT")
        self.recovery_pins = pins["legacyRecovery"]
        self.recovery_file_identity = None
        self.manual_risk = request["manualRelaunchRisk"]
        need(request["baselineCID"] == host["baselineCID"]
             and (self.manual_risk["baselineCID"] == host["baselineCID"]) == (self.resume is None),
             "M1_MANUAL_RELAUNCH_RISK_SCOPE_DRIFT")
        self.pdf_start_attempted = False

    def held(self, cutoff=None):
        self.lease.assert_current(self.lease.ledger)
        need(time.time() < (cutoff if cutoff is not None else self.request["D"]), "M1_HOST_ACTION_EXPIRED")

    def running_baseline(self):
        row = super().running_baseline()
        pid = row["State"]["Pid"]
        ticks = int((PROC / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()[19])
        task = self.task_path.stat()
        need(pid == self.host_pins["baselinePid"] and ticks == self.host_pins["baselineStartTicks"]
             and stat.S_ISREG(task.st_mode)
             and [task.st_dev, task.st_ino] == self.host_pins["taskStoreIdentity"],
             "M1_BASELINE_PROCESS_OR_TASK_DRIFT")
        return row

    def target_present(self):
        return self.docker("image", "inspect", self.target, "--format", "{{.Id}}").decode().strip() == self.target

    def create(self, name, baseline):
        return create_exact_target(DOCKER_SOCKET, name, baseline, self.target, disable_continuous=True,
                                   continuous_preimage=self.continuous_preimage)

    def verify_target(self, baseline, cid):
        verify_target(baseline, self.inspect(cid), cid, self.target, disable_continuous=True,
                      continuous_preimage=self.continuous_preimage)

    def recovery_projection(self, baseline, *, require_enrollment=True):
        pins = self.recovery_pins
        payload, mounts = legacy_recovery_projection(baseline, pins)
        config = {k: v for k, v in payload.items() if k != "HostConfig"}
        projected = (config, payload["HostConfig"], mounts)
        hashes = tuple(hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                       for value in projected)
        need(hashes == (pins["projectedConfigSHA256"], pins["projectedHostConfigSHA256"], pins["projectedMountsSHA256"]),
             "M1_RECOVERY_PROJECTION_DRIFT")
        path = Path(pins["dedicatedSource"])
        need(path.is_absolute() and path.resolve() == path and
             path == Path("/var/lib/otr/root2-c01-maintenance/m1-legacy-closed-runtime.json")
             and pins["sharedSource"] != str(path), "M1_RECOVERY_DEDICATED_PATH_REQUIRED")
        if require_enrollment:
            self.verify_recovery_file(path)
        return payload, mounts

    def enroll_recovery_file(self):
        self.held(self.request["cutoff"])
        path = Path(self.recovery_pins["dedicatedSource"])
        if self.resume:
            self.recovery_file_identity = tuple(self.resume["recoveryIdentity"])
            self.verify_recovery_file(path)
            return
        raw = b"{}\n"
        need(hashlib.sha256(raw).hexdigest() == self.recovery_pins["dedicatedSHA256"],
             "M1_RECOVERY_DEDICATED_FILE_DRIFT")
        parent = path.parent
        info = parent.stat(follow_symlinks=False)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
             "M1_RECOVERY_ENROLLMENT_DIRECTORY_UNSAFE")
        dfd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            state = os.fstat(dfd)
            need((state.st_dev, state.st_ino) == (info.st_dev, info.st_ino),
                 "M1_RECOVERY_ENROLLMENT_DIRECTORY_DRIFT")
            fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400, dir_fd=dfd)
            with os.fdopen(fd, "wb") as stream:
                os.fchown(stream.fileno(), 0, 999)
                os.fchmod(stream.fileno(), 0o440)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
                state = os.fstat(stream.fileno())
            os.fsync(dfd)
        finally:
            os.close(dfd)
        self.recovery_file_identity = (state.st_dev, state.st_ino)
        self.verify_recovery_file(path)
        self.held(self.request["cutoff"])

    def verify_recovery_file(self, path):
        pins = self.recovery_pins
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            need(stat.S_ISREG(info.st_mode) and (info.st_uid, info.st_gid, info.st_nlink) == (0, 999, 1)
                 and stat.S_IMODE(info.st_mode) == 0o440 and info.st_size <= 131072,
                 "M1_RECOVERY_DEDICATED_FILE_UNSAFE")
            raw = stream.read(131073)
            after = os.fstat(stream.fileno())
        current = path.stat(follow_symlinks=False)
        need((current.st_dev, current.st_ino, current.st_ctime_ns) ==
             (info.st_dev, info.st_ino, info.st_ctime_ns) and after.st_ctime_ns == info.st_ctime_ns,
             "M1_RECOVERY_DEDICATED_FILE_CHANGED")
        need(raw == b"{}\n" and hashlib.sha256(raw).hexdigest() == pins["dedicatedSHA256"],
             "M1_RECOVERY_DEDICATED_FILE_DRIFT")
        need(self.recovery_file_identity == (info.st_dev, info.st_ino),
             "M1_RECOVERY_ENROLLMENT_IDENTITY_DRIFT")

    def create_recovery(self, name, baseline):
        self.held()
        payload, _ = self.recovery_projection(baseline)
        payload["HostConfig"] = m1_create_host_config(payload["HostConfig"])
        self.held()
        return create_from_payload(DOCKER_SOCKET, name, payload)

    def verify_recovery(self, baseline, cid):
        need(cid != self.host["baselineCID"], "M1_RECOVERY_ORIGINAL_CID_REFUSED")
        payload, mounts = self.recovery_projection(baseline)
        host = m1_create_host_config(payload.pop("HostConfig"))
        row = self.inspect(cid)
        need(row["Image"] == baseline["Image"] and row["Config"] == payload and row["HostConfig"] == host
             and mount_projection(row) == mounts, "M1_RECOVERY_CONFIG_DRIFT")
        return row

    def historical_original_stopped(self):
        old = self.inspect(self.manual_risk["baselineCID"])
        state = old["State"]
        if state["Running"] is not False or state["Pid"] != 0:
            return False
        return self.resume["originalStop"] == {
            "name": old["Name"], "fingerprint": fingerprint(old), "startedAt": state["StartedAt"],
            "finishedAt": state["FinishedAt"], "exitCode": state["ExitCode"]}

    def verify_original_stopped(self, stopped, *, restored=False):
        self.held()
        current = self.baseline(self.host["baselineCID"])
        if self.resume and not self.historical_original_stopped():
            return False
        if restored:
            state = current["State"]
            return (self.resume is not None and state["Running"] is True and state["Pid"] > 0
                    and current["Name"] == "/otr-dev-backend"
                    and state["StartedAt"] != self.host_pins["baselineStartedAt"])
        return self.stopped_instance(current) == stopped

    def start(self, cid):
        self.held()
        need(cid != self.manual_risk["baselineCID"], "M1_AUTOMATIC_ORIGINAL_START_REFUSED")
        need(self.verify_ingress_fenced(), "M1_RESTART_INGRESS_FENCE_UNPROVED")
        self.held()
        super().start(cid)

    def verify_running(self, cid, baseline, target, deadline):
        healthy = super().verify_running(cid, baseline, target, deadline,
                                         verify_config=None if target or self.resume else self.verify_recovery)
        self.held(deadline)
        before = healthy["State"]
        pid = before["Pid"]
        need(before["Running"] is True and type(pid) is int and pid > 0, "M1_TARGET_PROCESS_UNPROVED")
        proc = PROC / str(pid)
        ticks = (proc / "stat").read_text().rsplit(")", 1)[1].split()[19]
        key = CONTINUOUS_HOST.encode()
        with (proc / "environ").open("rb") as stream:
            raw = stream.read(262145)
        need(len(raw) <= 262144, "M1_TARGET_PROCESS_ENV_TOO_LARGE")
        matching = [entry for entry in raw.split(b"\0") if entry.partition(b"=")[0] == key]
        if not target or self.resume:
            mount = proc / "root" / RUNTIME_DEST.lstrip("/")
            actual = hashlib.sha256(mount.read_bytes()).hexdigest()
            need(actual == self.recovery_pins["dedicatedSHA256"], "M1_RECOVERY_PROCESS_MOUNT_DRIFT")
            if self.resume:
                mounted = mount.stat()
                need([mounted.st_dev, mounted.st_ino] == self.resume["recoveryIdentity"],
                     "M1_RESUME_PROCESS_MOUNT_IDENTITY_DRIFT")
        current = self.inspect(cid)
        after = current["State"]
        need(matching == [key + b"=disabled"] and current["Name"] == healthy["Name"]
             and after["Running"] is True and after["Health"]["Status"] == "healthy"
             and after["Pid"] == pid and after["StartedAt"] == before["StartedAt"]
             and (proc / "stat").read_text().rsplit(")", 1)[1].split()[19] == ticks,
             "M1_TARGET_PROCESS_SELECTOR_UNPROVED")
        self.held(deadline)

    def caddy_state(self):
        self.held()
        def socket_pinned():
            info = Path(CADDY_SOCKET).lstat()
            return stat.S_ISSOCK(info.st_mode) and [info.st_dev, info.st_ino] == self.caddy_socket_identity
        need(socket_pinned(), "M1_CADDY_SOCKET_DRIFT")
        status, etag, raw = caddy(CONFIG_ROOT)
        need(status == 200 and etag is not None and socket_pinned(), "M1_CADDY_STATE_UNPROVED")
        return etag, raw

    def pdf_snapshot(self):
        self.held()
        state = pdf_state()
        pre = self.host_pins["pdfPreimage"]
        need(all(state[key] == pre[key] for key in ("LoadState", "Restart", "unitSHA256", "entrypoints")),
             "M1_PDF_SOFTWARE_DRIFT")
        return state

    def verify_pdf_preimage(self):
        state = self.pdf_snapshot()
        return all(state[k] == self.host_pins["pdfPreimage"][k]
                   for k in ("ActiveState", "SubState", "MainPID")) and pdf_socket_owned(state["MainPID"])

    def preflight(self):
        self.held(self.request["cutoff"])
        self.assert_timers_closed()
        baseline = self.running_baseline()
        target_payload(baseline, self.target, disable_continuous=True,
                       continuous_preimage=self.continuous_preimage)
        live = json.loads(self.caddy_state()[1])
        self.original_routes = live
        if self.resume:
            need(config_sha(live) == self.aperture_pins["scopedSHA256"], "M1_RESUME_SCOPED_PREIMAGE_DRIFT")
            self.enroll_recovery_file()
            mount = PROC / str(baseline["State"]["Pid"]) / "root" / RUNTIME_DEST.lstrip("/")
            statinfo = mount.stat()
            need([statinfo.st_dev, statinfo.st_ino] == self.resume["recoveryIdentity"],
                 "M1_RESUME_PROCESS_MOUNT_IDENTITY_DRIFT")
            server, index = self.host_pins["routePath"].split("/")[5:8:2]
            handle = live["apps"]["http"]["servers"][server]["routes"][int(index)]["handle"][0]
            self.original_routes = replace_handler(live, {"path": self.host_pins["routePath"],
                "original": handle["routes"][1]["handle"]}, "original")
            del self.original_routes["apps"]["http"]["servers"][APERTURE]
            need(config_sha(self.original_routes) == self.host_pins["routePins"]["before"],
                 "M1_RESUME_ORIGINAL_ROUTE_PROJECTION_DRIFT")
        else:
            self.recovery_projection(baseline, require_enrollment=False)
        self.route = route_plan(self.original_routes)
        self.scoped = route_after_maintenance(self.original_routes)
        self.aperture = CompositeHostAdapter(
            {"host": {"caddyFence": self.route, "caddyImportFence": self.scoped,
                      "aperture": self.aperture_pins}},
            self.lease, require_legacy_pg=False, allow_health_only=True)
        self.composite_full = self.aperture._fenced_config(self.original_routes)
        self.aperture._caddy_owner()
        expect = self.host_pins["routePins"]
        boundary = (self.historical_original_stopped() and self.pdf_inactive() and pdf_job_queue_empty()
                    and self.isolation.verify_direct_relaunch()
                    if self.resume else self.aperture._nft_absent() and self.verify_pdf_preimage()
                    and self.isolation.preflight() is True)
        return (self.route["path"] == self.scoped["path"] == self.host_pins["routePath"]
                and (self.route["before"], self.route["fenced"], self.scoped["fenced"])
                    == (expect["before"], expect["fullFence"], expect["importFence"])
                and self.target_present() and boundary)

    def fence_before_stop(self):
        self.held(self.request["cutoff"])
        self.caddy_state()
        self.aperture._caddy_owner()
        if self.resume:
            return (self.historical_original_stopped() and self.isolation.verify_direct_relaunch()
                    and self.aperture._set_servers(self.aperture_pins["scopedSHA256"], self.composite_full,
                                                  self.aperture_pins["fullSHA256"])
                    and self.verify_ingress_fenced())
        if (not self.aperture._nft_absent()
                or not self.aperture._set_servers(self.route["before"], self.composite_full,
                                                  self.aperture_pins["fullSHA256"])):
            return False
        self.held(self.request["cutoff"])
        return self.isolation.apply_direct_relaunch() is True and self.verify_ingress_fenced()

    def verify_ingress_fenced(self):
        self.caddy_state()
        return self.aperture.verify_fence() and self.isolation.verify_direct_relaunch() is True

    def restore_ingress_before_stop(self):
        self.held()
        return (self.verify_ingress_fenced() and pdf_job_queue_empty()
                and self.reverse_composite(self.aperture_pins["fullSHA256"], self.original_routes,
                                           self.route["before"], "PRESTOP_INGRESS_RESTORED"))

    def reverse_composite(self, before, after, after_sha, status):
        self.held()
        self.caddy_state()
        if (not self.aperture._composite(before)
                or self.isolation.verify_direct_relaunch() is not True
                or self.isolation.inverse_direct_relaunch_safe(status) is not True):
            return False
        self.held()
        guard = self.prestop_inverse_admitted if status == "PRESTOP_INGRESS_RESTORED" else None
        if not self.aperture._set_servers(before, after, after_sha, before_patch=guard):
            return False
        self.held()
        return (self.isolation.reverse_direct_relaunch() is True
                and self.aperture._nft_absent()
                and self.isolation.verify_direct_relaunch_preimage() is True
                and config_sha(json.loads(self.caddy_state()[1])) == after_sha)

    def prestop_inverse_admitted(self):
        self.held()
        clear = pdf_job_queue_empty()
        self.held()
        return clear

    def pdf_inactive(self):
        state = self.pdf_snapshot()
        try:
            SOCKET.lstat()
        except FileNotFoundError:
            return state["ActiveState"] == "inactive" and state["MainPID"] == "0"
        return False

    def stop_pdf(self):
        self.held(self.request["cutoff"])
        if self.resume:
            return True if (self.historical_original_stopped() and self.pdf_inactive()
                            and pdf_job_queue_empty()) else None
        need(self.verify_pdf_preimage(), "M1_PDF_STOP_PREIMAGE_UNPROVED")
        result = systemctl("stop", PDF, timeout=20, check=False)
        if not pdf_job_queue_empty():
            return None
        if result.returncode and self.verify_pdf_preimage():
            return False
        return True if self.pdf_inactive() else None

    def assert_retained_write_exclusion(self, request, stopped, readback):
        self.held(request["cutoff"])
        return (self.verify_ingress_fenced() and self.pdf_inactive()
                and self.isolation.retained_write_exclusion(request, stopped, readback) is True)

    def assert_inverse_admission(self, request, stopped, readback):
        self.held(request["inverseCutoff"])
        return (self.verify_ingress_fenced() and self.pdf_inactive()
                and self.isolation.inverse_admission(request, stopped, readback) is True)

    def restore_pdf_and_routes(self, status, stopped, readback):
        self.held()
        need(status in {"TARGET_CLOSED_HEALTHY", "BASELINE_CLOSED_HEALTHY"}
             and not self.pdf_start_attempted and self.verify_ingress_fenced()
             and self.verify_original_stopped(stopped,
                 restored=bool(self.resume and status == "BASELINE_CLOSED_HEALTHY"))
             and self.isolation.release_safe(status, self.manual_risk, readback, self.request["boundedLegacyEffects"]) is True and self.pdf_inactive()
             and time.time() + 25 < self.request["D"], "M1_RELEASE_ADMISSION_UNPROVED")
        if self.resume:
            return (pdf_job_queue_empty() and self.aperture.open_import_fenced()
                    and self.aperture._composite(self.aperture_pins["scopedSHA256"])
                    and self.pdf_inactive() and self.isolation.verify_direct_relaunch())
        self.pdf_start_attempted = True
        systemctl("start", PDF, timeout=20)
        until = min(time.time() + 15, self.request["D"])
        while time.time() < until:
            state = self.pdf_snapshot()
            if state["ActiveState"] == "active" and int(state["MainPID"]) > 0 and pdf_socket_owned(state["MainPID"]):
                self.caddy_state()
                if (not self.verify_original_stopped(stopped)
                        or self.isolation.release_safe(status, self.manual_risk, readback, self.request["boundedLegacyEffects"]) is not True
                        or not self.aperture.open_import_fenced()):
                    return False
                self.caddy_state()
                scoped = self.aperture_pins["scopedSHA256"]
                if status == "BASELINE_CLOSED_HEALTHY":
                    # Retain the scoped ingress fence for the dedicated baseline recovery.
                    return self.aperture._composite(scoped) and self.isolation.verify_direct_relaunch() is True
                return self.reverse_composite(
                    scoped, replace_handler(self.original_routes, self.scoped, "forward"),
                    self.scoped["fenced"], status)
            time.sleep(0.2)
        return False


def build_ops(request, host, lease):
    runtime = HERE.parents[1] if HERE.name == "c01-nov06-b-release-062a4903" else HERE
    # The sealed owning port must bind actual DEV ingress/relaunch and write evidence.
    # Without it startup refuses before Caddy, Docker or systemd mutation.
    pins = load(runtime / "m1-retained-control.py", request.get("controlsSHA256") or "")
    bounded = request.get("boundedLegacyEffects")
    need(bounded is not None and pins.get("BOUNDED_LEGACY_EFFECTS") == bounded,
         "M1_BOUNDED_LEGACY_PRODUCTION_BINDING_DRIFT")
    return M1HostActions(request, host, lease, pins["HOST_PINS"], pins["build_control"](request, lease))
