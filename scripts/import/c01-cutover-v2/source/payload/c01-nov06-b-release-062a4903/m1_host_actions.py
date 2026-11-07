"""M1's fixed Caddy, Docker and PDF actions, with a sealed owning isolation port."""
import hashlib
import json
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

from caddy_admin_cas import CONFIG_ROOT, admin_cas_request
from controls import config_sha, route_plan
from dev_host_worker import need
from host_adapter import CADDY_SOCKET, DOCKER_SOCKET, DockerOps, caddy
from host_target_binding import CONTINUOUS_HOST, create_exact_target, target_payload, verify_target
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
        super().__init__({
            "baselineCID": host["baselineCID"], "baselineFingerprintSHA256": host["baselineConfigSHA256"],
            "baselineStartedAt": pins["baselineStartedAt"], "baselineBundlePins": pins["baselineBundlePins"],
            "targetBundlePins": pins["targetBundlePins"],
        })
        self.request, self.lease, self.host_pins, self.isolation = request, lease, host, isolation
        need(request["candidateContinuousHost"] == "disabled", "M1_CONTINUOUS_SELECTOR_REQUIRED")
        self.target = request["targetImage"]
        self.caddy_socket_identity = pins["caddySocketIdentity"]
        self.task_path = Path(pins["taskStorePath"])
        need(self.task_path.is_absolute() and self.task_path.resolve() == self.task_path,
             "M1_TASK_STORE_PATH_DRIFT")
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
        return create_exact_target(DOCKER_SOCKET, name, baseline, self.target, disable_continuous=True)

    def verify_target(self, baseline, cid):
        verify_target(baseline, self.inspect(cid), cid, self.target, disable_continuous=True)

    def start(self, cid):
        self.held()
        need(self.verify_ingress_fenced(), "M1_RESTART_INGRESS_FENCE_UNPROVED")
        self.held()
        super().start(cid)

    def verify_running(self, cid, baseline, target, deadline):
        super().verify_running(cid, baseline, target, deadline)
        if not target:
            return
        self.held(deadline)
        before = self.inspect(cid)["State"]
        pid = before["Pid"]
        need(before["Running"] is True and type(pid) is int and pid > 0, "M1_TARGET_PROCESS_UNPROVED")
        proc = PROC / str(pid)
        ticks = (proc / "stat").read_text().rsplit(")", 1)[1].split()[19]
        key = CONTINUOUS_HOST.encode()
        with (proc / "environ").open("rb") as stream:
            raw = stream.read(262145)
        need(len(raw) <= 262144, "M1_TARGET_PROCESS_ENV_TOO_LARGE")
        matching = [entry for entry in raw.split(b"\0") if entry.partition(b"=")[0] == key]
        after = self.inspect(cid)["State"]
        need(matching == [key + b"=disabled"] and after["Running"] is True
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

    def patch_route(self, route, reverse=False):
        etag, raw = self.caddy_state()
        method, path, headers, body = admin_cas_request(route, raw, etag, reverse=reverse)
        status, _, _ = caddy(path, method, headers, json.dumps(body).encode())
        need(status == 200, "M1_CADDY_PATCH_UNKNOWN")
        return config_sha(json.loads(self.caddy_state()[1])) == route["before" if reverse else "fenced"]

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
        target_payload(self.running_baseline(), self.target, disable_continuous=True)
        original = json.loads(self.caddy_state()[1])
        self.route, self.scoped = route_plan(original), route_after_maintenance(original)
        expect = self.host_pins["routePins"]
        return (self.route["path"] == self.scoped["path"] == self.host_pins["routePath"]
                and (self.route["before"], self.route["fenced"], self.scoped["fenced"])
                    == (expect["before"], expect["fullFence"], expect["importFence"])
                and self.target_present() and self.verify_pdf_preimage()
                and self.isolation.preflight() is True)

    def fence_before_stop(self):
        self.held(self.request["cutoff"])
        return self.patch_route(self.route) and self.isolation.apply_direct_relaunch() is True and self.verify_ingress_fenced()

    def verify_ingress_fenced(self):
        return (config_sha(json.loads(self.caddy_state()[1])) == self.route["fenced"]
                and self.isolation.verify_direct_relaunch() is True)

    def restore_ingress_before_stop(self):
        self.held()
        return (self.verify_ingress_fenced() and pdf_job_queue_empty()
                and self.patch_route(self.route, reverse=True)
                and self.reverse_direct_relaunch())

    def reverse_direct_relaunch(self):
        self.held()
        return (self.isolation.reverse_direct_relaunch() is True
                and self.isolation.verify_direct_relaunch_preimage() is True)

    def pdf_inactive(self):
        state = self.pdf_snapshot()
        try:
            SOCKET.lstat()
        except FileNotFoundError:
            return state["ActiveState"] == "inactive" and state["MainPID"] == "0"
        return False

    def stop_pdf(self):
        self.held(self.request["cutoff"])
        need(self.verify_pdf_preimage(), "M1_PDF_STOP_PREIMAGE_UNPROVED")
        result = systemctl("stop", PDF, timeout=20, check=False)
        if not pdf_job_queue_empty():
            return None
        if result.returncode and self.verify_pdf_preimage():
            return False
        return True if self.pdf_inactive() else None

    def assert_retained_write_exclusion(self, request, stopped):
        self.held(request["cutoff"])
        return (self.verify_ingress_fenced() and self.pdf_inactive()
                and self.isolation.retained_write_exclusion(request, stopped) is True)

    def assert_inverse_admission(self, request, stopped):
        self.held(request["inverseCutoff"])
        return (self.verify_ingress_fenced() and self.pdf_inactive()
                and self.isolation.inverse_admission(request, stopped) is True)

    def restore_pdf_and_routes(self, status):
        self.held()
        need(status in {"TARGET_CLOSED_HEALTHY", "BASELINE_CLOSED_HEALTHY"}
             and not self.pdf_start_attempted and self.verify_ingress_fenced()
             and self.isolation.release_safe(status) is True and self.pdf_inactive()
             and time.time() + 25 < self.request["D"], "M1_RELEASE_ADMISSION_UNPROVED")
        self.pdf_start_attempted = True
        systemctl("start", PDF, timeout=20)
        until = min(time.time() + 15, self.request["D"])
        while time.time() < until:
            state = self.pdf_snapshot()
            if state["ActiveState"] == "active" and int(state["MainPID"]) > 0 and pdf_socket_owned(state["MainPID"]):
                return self.patch_route(self.scoped) and self.reverse_direct_relaunch()
            time.sleep(0.2)
        return False


def build_ops(request, host, lease):
    runtime = HERE.parents[1] if HERE.name == "c01-nov06-b-release-062a4903" else HERE
    # The sealed owning port must bind actual DEV ingress/relaunch and write evidence.
    # Without it startup refuses before Caddy, Docker or systemd mutation.
    pins = load(runtime / "m1-retained-control.py", request.get("controlsSHA256") or "")
    return M1HostActions(request, host, lease, pins["HOST_PINS"], pins["build_control"](request, lease))
