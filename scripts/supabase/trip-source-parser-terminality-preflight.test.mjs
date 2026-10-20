import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";

// Test-only. No product import, decoder, provider call, SQL or runtime credentials.
const root = "/Users/xoery/Project/otr-mobile-import";
assert.equal(process.cwd(), root);
const baseline = "4dc70958b9347d45c4decaa85150c85efe8f6b57";
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  baseline,
);
const directory = root + "/.ci3f";
const docker = (...args) =>
  execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
const image = docker("image", "inspect", "node:24-bookworm-slim", "--format", "{{.Id}}");
const profile = Object.freeze({
  network: "none",
  readOnly: true,
  user: "65534:65534",
  cpu: 1,
  cpuSeconds: 1,
  memoryMiB: 128,
  pids: 16,
  fd: 32,
  fileMiB: 8,
  tmpMiB: 16,
  outputBytes: 4096,
  wallMs: 5000,
  purpose: "PROBE_ONLY_NO_DECODER",
});
const fingerprint = createHash("sha256")
  .update(JSON.stringify({ image, profile }))
  .digest("hex");
const evidence = {
  image,
  profile,
  fingerprint,
  probes: [],
  simulation: "not a provider terminality guarantee",
};
const worker = String.raw`
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
const mode = process.argv[1];
const emit = (value) => process.stdout.write(JSON.stringify({ status: "PROBE_ONLY", ...value }));
if (mode === "boundary") {
  const source = fs.readFileSync("/input");
  let inputDenied=false, rootDenied=false;
  try { fs.writeFileSync("/input","changed"); } catch(e) { inputDenied=e.code==="EROFS"; }
  try { fs.writeFileSync("/outside-tmp","changed"); } catch(e) { rootDenied=e.code==="EROFS" || e.code==="EACCES"; }
  const forbidden = Object.keys(process.env).some(k=>/SUPABASE|TOKEN|SECRET|CREDENTIAL|DATABASE/.test(k));
  const networkError = await new Promise(resolve=>{
    const socket=net.connect({host:"192.0.2.1",port:9});
    socket.on("error",e=>{resolve(e.code);socket.destroy();});
    socket.setTimeout(500,()=>{resolve("TIMEOUT");socket.destroy();});
  });
  emit({inputBytes:source.length,inputDenied,rootDenied,forbidden,networkError,uid:process.getuid()});
} else if(mode==="timeout") {
  await new Promise(()=>{setInterval(()=>{},1000);});
} else if(mode==="crash") {
  process.abort();
} else if(mode==="protocol") {
  process.stdout.write("not-json");
} else if(mode==="cpu") {
  for(;;) Math.sqrt(Math.random());
} else if(mode==="memory") {
  const retained=[];for(;;)retained.push(Buffer.alloc(8*1024*1024,65));
} else if(mode==="output") {
  for(;;)process.stdout.write("x".repeat(4096));
} else if(mode==="fds") {
  const handles=[];let error;
  try{for(;;)handles.push(fs.openSync("/dev/null","r"));}catch(e){error=e.code;}
  for(const fd of handles)fs.closeSync(fd);
  emit({error});
} else if(mode==="file") {
  const fd=fs.openSync("/tmp/limited","w");let error;
  try{for(let i=0;i<129;i++)fs.writeSync(fd,Buffer.alloc(65536));}catch(e){error=e.code;}
  fs.closeSync(fd);emit({error});
} else if(mode==="pids") {
  const children=[];let failed=false;
  for(let i=0;i<32;i++){
    await new Promise(resolve=>{
      const child=spawn("/bin/sleep",["30"]);children.push(child);
      child.once("spawn",resolve);child.once("error",()=>{failed=true;resolve();});
    });
  }
  for(const child of children)child.kill("SIGKILL");
  emit({failed});
}
`;
let serial = 0;
async function sandbox(mode, wallMs = profile.wallMs) {
  const name = "otr-ci3f-probe-" + process.pid + "-" + ++serial;
  const args = [
    "run",
    "--name",
    name,
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=65534:65534",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=128m",
    "--memory-swap=128m",
    "--cpus=1",
    "--pids-limit=16",
    "--ulimit=nofile=32:32",
    "--ulimit=cpu=1:1",
    "--ulimit=fsize=8388608:8388608",
    "--ulimit=core=0:0",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
    "--mount",
    "type=bind,source=" + directory + "/input,target=/input,readonly",
    "--workdir=/tmp",
    image,
    "node",
    "--input-type=module",
    "-e",
    worker,
    mode,
  ];
  let stdout = "",
    bytes = 0,
    killedFor = null;
  const child = spawn("docker", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const kill = (reason) => {
    if (killedFor) return;
    killedFor = reason;
    try {
      docker("kill", name);
    } catch {
      /* Inspect below must still prove terminality. */
    }
  };
  const timer = setTimeout(() => kill("PARSER_TIMEOUT"), wallMs);
  child.stdout.on("data", (data) => {
    bytes += data.length;
    if (bytes > profile.outputBytes) kill("PARSER_OUTPUT_LIMIT");
    else stdout += data;
  });
  child.stderr.on("data", (data) => {
    bytes += data.length; // Never retain raw stderr or payload/stack traces.
    if (bytes > profile.outputBytes) kill("PARSER_OUTPUT_LIMIT");
  });
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    clearTimeout(timer);
    const inspection = JSON.parse(docker("inspect", name))[0];
    assert.equal(
      inspection.State.Running,
      false,
      "no temp cleanup until process terminal",
    );
    assert.equal(inspection.HostConfig.NetworkMode, "none");
    assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspection.Config.User, "65534:65534");
    assert.equal(inspection.HostConfig.Memory, 128 * 1024 ** 2);
    assert.equal(inspection.HostConfig.MemorySwap, 128 * 1024 ** 2);
    assert.equal(inspection.HostConfig.PidsLimit, 16);
    assert.ok(inspection.HostConfig.SecurityOpt.includes("no-new-privileges"));
    assert.equal(inspection.Mounts.find((m) => m.Destination === "/input").RW, false);
    let decoded = null;
    let safeError =
      killedFor ||
      (inspection.State.OOMKilled
        ? "PARSER_RESOURCE_LIMIT"
        : code !== 0
          ? "PARSER_CRASH"
          : null);
    if (!safeError) {
      try {
        decoded = JSON.parse(stdout);
        assert.equal(decoded.status, "PROBE_ONLY");
      } catch {
        safeError = "PARSER_PROTOCOL";
        decoded = null;
      }
    }
    const result = {
      mode,
      exitCode: code,
      oom: inspection.State.OOMKilled,
      killedFor,
      safeError,
      result: decoded,
      terminal: true,
    };
    evidence.probes.push(result);
    return result;
  } finally {
    clearTimeout(timer);
    const running = docker("inspect", name, "--format", "{{.State.Running}}");
    assert.equal(running, "false", "do not remove running sandbox or staged input");
    docker("rm", name);
  }
}

// Deterministic model only. Proofs are owned by this private closure, not caller
// booleans. Durable journal/authentication/provider guarantees are not simulated away.
function ownerModel() {
  const proofs = new WeakSet();
  const state = {
    phase: "ADMITTED",
    generation: 0,
    attempt: null,
    owner: "db-execution-principal",
    intent: "exact-digest",
    journal: null,
    parser: false,
    bytes: false,
    admission: true,
    staged: false,
    processLive: false,
    stageCount: 0,
    parseCount: 0,
  };
  const pins = () => ({
    attempt: state.attempt,
    generation: state.generation,
    owner: state.owner,
    intent: state.intent,
  });
  const exact = (p) => assert.deepEqual(p, pins(), "stale exact-attempt CAS");
  function start(attempt) {
    assert.ok(
      ["ADMITTED", "IO_QUIESCENT"].includes(state.phase),
      "UNKNOWN/live writer cannot retry",
    );
    assert.ok(state.admission);
    state.generation++;
    state.attempt = attempt;
    state.phase = "IO_ACTIVE";
    state.journal = { dispatchIntent: false, terminal: null };
    state.bytes = false;
    state.parser = false;
    state.staged = false;
    state.processLive = false;
    return pins();
  }
  function stage(p) {
    exact(p);
    assert.equal(state.phase, "IO_ACTIVE", "exclusive live attempt required");
    assert.equal(state.journal.dispatchIntent, false);
    assert.equal(state.staged, false);
    state.processLive = true;
    state.staged = true;
    state.stageCount++;
  }
  function parse(p, success = true) {
    exact(p);
    assert.equal(state.phase, "IO_ACTIVE");
    assert.equal(state.staged, true, "stage only under exact attempt first");
    assert.equal(state.journal.dispatchIntent, false);
    state.parseCount++;
    state.parser = success;
    state.processLive = false;
  }
  function stopProcess(p) {
    exact(p);
    // Model exact process kill/join acknowledgement, never elapsed time.
    state.processLive = false;
  }
  function dispatch(p) {
    exact(p);
    assert.equal(state.phase, "IO_ACTIVE");
    assert.ok(
      state.staged && state.parser && !state.processLive,
      "verified staging/parser before provider",
    );
    state.journal.dispatchIntent = true;
  }
  function unknown(p) {
    exact(p);
    assert.ok(["IO_ACTIVE", "IO_UNKNOWN"].includes(state.phase));
    state.phase = "IO_UNKNOWN";
  }
  function sealNoDispatch(p) {
    exact(p);
    assert.equal(state.journal.dispatchIntent, false);
    assert.equal(state.processLive, false, "exact staging/parser process still live");
    const proof = { ...p, kind: "DURABLE_NO_DISPATCH" };
    proofs.add(proof);
    return proof;
  }
  function sealResponse(p, providerCompletedCallGuarantee) {
    exact(p);
    assert.equal(state.journal.dispatchIntent, true);
    assert.equal(
      providerCompletedCallGuarantee,
      "ASSUMED_ONLY_IN_MODEL",
      "missing actual provider guarantee",
    );
    const proof = { ...p, kind: "OWNER_TERMINAL_RESPONSE" };
    proofs.add(proof);
    state.journal.terminal = proof;
    return proof;
  }
  function quiesce(p, proof) {
    exact(p);
    assert.ok(["IO_ACTIVE", "IO_UNKNOWN"].includes(state.phase));
    assert.ok(proofs.has(proof), "untrusted proof");
    exact(proof.kind ? (({ kind, ...fields }) => fields)(proof) : proof);
    state.phase = "IO_QUIESCENT";
  }
  function finalize() {
    assert.equal(state.phase, "IO_QUIESCENT", "UNKNOWN cannot finalize");
    assert.ok(
      state.admission && state.parser && state.bytes,
      "independent parser/bytes/admission checks",
    );
    state.phase = "FINAL";
  }
  return {
    state,
    start,
    dispatch,
    stage,
    parse,
    stopProcess,
    unknown,
    sealNoDispatch,
    sealResponse,
    quiesce,
    finalize,
    cleanup: () =>
      assert.ok(
        ["IO_QUIESCENT", "FINAL"].includes(state.phase),
        "UNKNOWN cannot cleanup",
      ),
  };
}
test("C-I3F sandbox boundary and exact-owner completion model", async (t) => {
  await mkdir(directory, { mode: 0o700 });
  await writeFile(directory + "/input", "synthetic-read-only-input", {
    mode: 0o444,
    flag: "wx",
  });
  try {
    await t.test(
      "no network/credentials; nonroot and readonly staged input/root",
      async () => {
        const p = await sandbox("boundary");
        assert.equal(p.exitCode, 0);
        assert.deepEqual(p.result, {
          status: "PROBE_ONLY",
          inputBytes: 25,
          inputDenied: true,
          rootDenied: true,
          forbidden: false,
          networkError: "ENETUNREACH",
          uid: 65534,
        });
      },
    );
    await t.test(
      "wall timeout kills and joins the exact worker before cleanup",
      async () => {
        const p = await sandbox("timeout", 2500);
        assert.equal(p.killedFor, "PARSER_TIMEOUT");
        assert.notEqual(p.exitCode, 0);
        assert.equal(p.terminal, true);
      },
    );
    await t.test("parser process crash never becomes a parser PASS", async () => {
      const p = await sandbox("crash");
      assert.notEqual(p.exitCode, 0);
      assert.equal(p.result, null);
    });
    await t.test(
      "exit-zero malformed IPC is fail-closed without crashing parent",
      async () => {
        const p = await sandbox("protocol");
        assert.equal(p.exitCode, 0);
        assert.equal(p.safeError, "PARSER_PROTOCOL");
        assert.equal(p.result, null);
      },
    );
    await t.test("OS CPU limit terminates busy parser", async () => {
      const p = await sandbox("cpu");
      assert.notEqual(p.exitCode, 0);
      assert.equal(p.killedFor, null);
      assert.equal(p.oom, false);
    });
    await t.test("cgroup memory limit terminates allocating parser", async () => {
      const p = await sandbox("memory");
      assert.notEqual(p.exitCode, 0);
      assert.equal(p.oom, true);
    });
    await t.test("bounded IPC output terminates flooding parser", async () => {
      const p = await sandbox("output");
      assert.equal(p.killedFor, "PARSER_OUTPUT_LIMIT");
      assert.equal(p.result, null);
    });
    await t.test("file descriptor ceiling enforced", async () => {
      const p = await sandbox("fds");
      assert.equal(p.result.error, "EMFILE");
    });
    await t.test("file size ceiling enforced", async () => {
      const p = await sandbox("file");
      assert.ok(p.exitCode !== 0 || p.result.error === "EFBIG");
    });
    await t.test("PID ceiling rejects child process exhaustion", async () => {
      const p = await sandbox("pids");
      assert.equal(p.result.failed, true);
    });
    await t.test(
      "staging and parser cannot precede exclusive exact attempt ownership",
      () => {
        const m = ownerModel();
        assert.throws(() => m.stage(null));
        assert.throws(() => m.parse(null));
        assert.equal(m.state.stageCount, 0);
        assert.equal(m.state.parseCount, 0);
      },
    );
    await t.test(
      "concurrent same-Representation requests: loser never stages or parses",
      async () => {
        const m = ownerModel();
        const results = await Promise.allSettled(
          ["one", "two"].map(async (id) => {
            const p = m.start(id); // Shared Representation slot/CAS, deterministic model only.
            m.stage(p);
            m.parse(p);
            return p;
          }),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(results.filter((r) => r.status === "rejected").length, 1);
        assert.equal(m.state.stageCount, 1);
        assert.equal(m.state.parseCount, 1);
        assert.equal(m.state.journal.dispatchIntent, false);
      },
    );
    await t.test(
      "owner crash during staging/parser retains slot until exact terminal proof",
      () => {
        for (const cut of ["staging", "parser"]) {
          const m = ownerModel(),
            p = m.start(cut);
          m.stage(p);
          if (cut === "parser") m.state.parseCount++; // Child running at crash cut.
          m.unknown(p);
          assert.equal(m.state.journal.dispatchIntent, false);
          assert.throws(() => m.sealNoDispatch(p), /still live/);
          assert.throws(() => m.start("parallel-retry"));
          assert.throws(m.cleanup);
          m.stopProcess(p);
          m.quiesce(p, m.sealNoDispatch(p));
          assert.equal(m.state.phase, "IO_QUIESCENT");
          assert.throws(m.finalize); // No invented parser-failure receipt/helper.
        }
      },
    );
    await t.test("parser failure after reservation leaves no provider I/O", () => {
      const m = ownerModel(),
        p = m.start("bad-input");
      m.stage(p);
      m.parse(p, false);
      assert.throws(() => m.dispatch(p), /verified staging/);
      assert.equal(m.state.journal.dispatchIntent, false);
      assert.throws(() => m.start("parallel"));
      m.quiesce(p, m.sealNoDispatch(p));
      assert.throws(m.finalize); // Exact rejection disposition remains PENDING/BLOCKED.
    });
    await t.test(
      "retry resolves existing phase and never allocates a parallel writer",
      () => {
        const m = ownerModel(),
          old = m.start("original");
        m.stage(old);
        for (const phase of ["IO_ACTIVE", "IO_UNKNOWN"]) {
          if (phase === "IO_UNKNOWN") m.unknown(old);
          assert.throws(() => m.start("retry"));
          assert.equal(m.state.attempt, "original");
          assert.equal(m.state.generation, 1);
          assert.equal(m.state.stageCount, 1);
        }
        m.stopProcess(old);
        m.quiesce(old, m.sealNoDispatch(old));
        const fresh = m.start("approved-quiescent-retry");
        assert.equal(fresh.generation, 2);
        assert.throws(() => m.stage(old));
        m.stage(fresh);
        assert.equal(m.state.stageCount, 2);
      },
    );
    await t.test("pre-dispatch durable no-send proof is distinct from timeout", () => {
      const m = ownerModel(),
        p = m.start("attempt-1");
      m.unknown(p);
      m.quiesce(p, m.sealNoDispatch(p));
      assert.equal(m.state.phase, "IO_QUIESCENT");
    });
    await t.test(
      "dispatch crash/response loss/lease do not quiesce or permit retry",
      () => {
        const m = ownerModel(),
          p = m.start("attempt-1");
        m.stage(p);
        m.parse(p);
        m.dispatch(p);
        m.unknown(p);
        for (const claim of [
          { timeout: true },
          { socketClosed: true },
          { leaseExpired: true },
          { objectExists: true },
        ])
          assert.throws(() => m.quiesce(p, claim), /untrusted/);
        assert.throws(() => m.start("attempt-2"));
        assert.throws(m.finalize);
        assert.throws(m.cleanup);
        assert.throws(() => m.sealResponse(p, "provider guarantee unavailable"));
      },
    );
    await t.test(
      "duplicate start, changed intent and stale owner/generation reject",
      () => {
        const m = ownerModel(),
          p = m.start("attempt-1");
        assert.throws(() => m.start("duplicate"));
        for (const altered of [
          { ...p, owner: "other" },
          { ...p, intent: "changed" },
          { ...p, generation: 2 },
          { ...p, attempt: "other" },
        ])
          assert.throws(() => m.dispatch(altered));
      },
    );
    await t.test(
      "durable terminal response can reconcile after bookkeeping crash only with assumed provider guarantee",
      () => {
        const m = ownerModel(),
          p = m.start("attempt-1");
        m.stage(p);
        m.parse(p);
        m.dispatch(p);
        const proof = m.sealResponse(p, "ASSUMED_ONLY_IN_MODEL");
        m.unknown(p);
        m.quiesce(p, proof);
        assert.equal(m.state.phase, "IO_QUIESCENT");
        m.state.parser = true;
        m.state.bytes = true;
        m.finalize();
        assert.equal(m.state.phase, "FINAL");
      },
    );
    await t.test("new generation fences old completion after restart", () => {
      const m = ownerModel(),
        old = m.start("attempt-1");
      m.stage(old);
      m.parse(old);
      m.dispatch(old);
      const proof = m.sealResponse(old, "ASSUMED_ONLY_IN_MODEL");
      m.unknown(old);
      m.quiesce(old, proof);
      const current = m.start("attempt-2");
      assert.equal(current.generation, 2);
      assert.throws(() => m.quiesce(old, proof));
      assert.equal(m.state.phase, "IO_ACTIVE");
    });
    await t.test(
      "matching collision cannot prove writer terminality; mismatch never repairs bytes",
      () => {
        const m = ownerModel(),
          p = m.start("attempt-1");
        m.stage(p);
        m.parse(p);
        m.dispatch(p);
        m.unknown(p);
        m.state.bytes = true;
        assert.throws(() => m.quiesce(p, { hashEqual: true }));
        m.state.bytes = false;
        assert.throws(m.finalize);
        assert.equal(m.state.phase, "IO_UNKNOWN");
      },
    );
    await t.test(
      "parser proof, completion proof, byte proof and current admission remain separate",
      () => {
        const m = ownerModel(),
          p = m.start("attempt-1");
        m.state.parser = true;
        assert.throws(m.finalize);
        m.stage(p);
        m.parse(p);
        m.dispatch(p);
        m.quiesce(p, m.sealResponse(p, "ASSUMED_ONLY_IN_MODEL"));
        assert.throws(m.finalize);
        m.state.bytes = true;
        m.state.admission = false;
        assert.throws(m.finalize);
        m.state.admission = true;
        m.finalize();
        assert.throws(() => m.start("after-final"));
      },
    );
  } finally {
    // Every sandbox function requires terminal inspection before rm/input cleanup.
    assert.equal(
      docker("ps", "-aq", "--filter", "name=otr-ci3f-probe-" + process.pid),
      "",
    );
    await writeFile(
      directory + "/evidence.json",
      JSON.stringify(evidence, null, 2) + "\n",
      { mode: 0o600 },
    );
    await rm(directory + "/input");
  }
});
