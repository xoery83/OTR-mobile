import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { execFileSync, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, open, rm, chmod } from "node:fs/promises";
import { constants } from "node:fs";
import { profile, profileHash } from "./profile.mjs";
import { requestFor, validateResult } from "./protocol.mjs";

const root = "/Users/xoery/Project/otr-mobile-import";
const baseline = "2c81c548f9dfbe38a80ad3ee8e8c7ff18d8fa6ca";
const environment = { PATH: process.env.PATH, HOME: process.env.HOME };
const command = (...args) =>
  execFileSync("docker", args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 10000,
    stdio: "pipe",
  }).trim();
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);

// INTERNAL TEST ONLY. These reservations model already-admitted ownership, never
// authenticate an Account or invoke C-I3D. There is no product import/route.
export async function localParserPreflight() {
  assert.equal(process.cwd(), root);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    baseline,
  );
  const inspected = JSON.parse(command("image", "inspect", "otr-ci3g-parser:local"))[0];
  assert.equal(inspected.Config.Labels["org.otr.parser-profile"], profileHash());
  assert.equal(
    inspected.Id,
    "sha256:95bd75e07c0bdc5b792a44bff83082ab9a15633b2e028b781f26053117779da7",
    "reviewed immutable worker image required",
  );
  const image = inspected.Id; // Immutable ID, not a mutable tag at worker launch.
  const staging = root + "/.ci3g/staging";
  await mkdir(staging, { recursive: true, mode: 0o700 });
  const slots = new Map(),
    owned = new WeakMap(),
    terminationObligations = new Map();
  function reserveForTest(pins) {
    const fields = [
      "operationId",
      "operationKey",
      "operationDigest",
      "prepareId",
      "representationId",
      "attemptId",
      "generation",
      "owner",
      "inputHash",
      "inputCount",
      "declaredMime",
    ];
    assert.deepEqual(Object.keys(pins), fields);
    for (const key of ["operationId", "prepareId", "representationId", "attemptId"])
      assert.ok(uuid(pins[key]));
    for (const key of ["operationDigest", "inputHash"])
      assert.match(pins[key], /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(pins.generation) && pins.generation > 0);
    assert.match(pins.operationKey, /^[A-Za-z0-9_-]{1,128}$/);
    assert.match(pins.owner, /^[a-z_]{1,64}$/);
    assert.ok(
      Number.isSafeInteger(pins.inputCount) &&
        pins.inputCount > 0 &&
        pins.inputCount <= profile.inputBytes,
    );
    assert.equal(pins.declaredMime, profile.mime); // Cheap allowlist before payload supplier.
    assert.equal(
      slots.has(pins.representationId),
      false,
      "BUSY / existing operation; do not read payload",
    );
    const reservation = Object.freeze({});
    owned.set(reservation, {
      pins: { ...pins },
      phase: "IO_ACTIVE",
      terminal: true,
      started: false,
      path: null,
    });
    slots.set(pins.representationId, reservation);
    return reservation;
  }
  function exact(handle) {
    const entry = owned.get(handle);
    assert.ok(
      entry && slots.get(entry.pins.representationId) === handle,
      "exclusive exact test attempt required",
    );
    return entry;
  }
  async function runOwned(handle, payload, fault = null) {
    const entry = exact(handle);
    assert.equal(entry.phase, "IO_ACTIVE");
    assert.equal(entry.started, false, "no parallel staging/parser");
    entry.started = true;
    entry.terminal = false;
    const token = randomBytes(16).toString("hex");
    entry.path = staging + "/" + token;
    await mkdir(entry.path, { mode: 0o700 });
    const input = entry.path + "/input";
    const file = await open(
      input,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    let count = 0;
    // Independent parent streaming hash; only call payload supplier after reservation.
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256");
    try {
      for await (const chunk of payload()) {
        assert.ok(
          Buffer.isBuffer(chunk) && chunk.length <= 1048576,
          "bounded ingress chunks",
        );
        count += chunk.length;
        assert.ok(
          count <= entry.pins.inputCount && count <= profile.inputBytes,
          "FORMAT_RESOURCE_LIMIT",
        );
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length)
          offset += (await file.write(chunk, offset)).bytesWritten;
      }
      await file.sync();
    } catch (error) {
      entry.terminal = true;
      throw error; // Reserved slot retained; no provider or parser I/O.
    } finally {
      await file.close();
    }
    if (count !== entry.pins.inputCount || hash.digest("hex") !== entry.pins.inputHash) {
      entry.terminal = true;
      throw new Error("PARSER_INPUT_IDENTITY");
    }
    await chmod(input, 0o444);
    let request = requestFor(token, entry.pins.inputHash, count, entry.pins.declaredMime);
    // Named fault seam is test-only; never selected by product/user material.
    if (fault?.request) request = { ...request, ...fault.request };
    const name = "otr-ci3g-parser-" + token;
    const args = [
      "create",
      "--label",
      "org.otr.run-token=" + token,
      "--name",
      name,
      "--pull=never",
      "--network=none",
      "--read-only",
      "--user",
      "65534:65534",
      "--cap-drop=ALL",
      "--security-opt",
      "no-new-privileges",
      "--cpus=1",
      "--memory=128m",
      "--memory-swap=128m",
      "--pids-limit=16",
      "--ulimit",
      "cpu=1:1",
      "--ulimit",
      "nofile=32:32",
      "--ulimit",
      "fsize=8388608:8388608",
      "--ulimit",
      "core=0:0",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
      "--mount",
      "type=bind,src=" + input + ",dst=/input,readonly",
      "-i",
    ];
    if (fault?.script) args.push("--entrypoint", "node");
    args.push(image);
    if (fault?.script) args.push("--max-old-space-size=64", "-e", fault.script);
    const lifecycle = {
      name,
      token,
      id: null,
      requested: null,
      launchSettled: false,
      startIssued: false,
      startTransportUnknown: false,
      createFailed: false,
      exit: null,
      output: "",
      size: 0,
      hasStderr: false,
      fault,
    };
    entry.lifecycle = lifecycle;
    // Process-local responsibility outlives the caller's bounded wait. Lifecycle
    // acknowledgements wake reconciliation immediately; unavailable Docker uses
    // capped backoff, retaining the exact pending process and reservation.
    lifecycle.waiters = new Set();
    lifecycle.wake = () => {
      for (const resolve of lifecycle.waiters) resolve();
    };
    const requestTermination = (code) => {
      lifecycle.requested ??= code;
      lifecycle.wake();
    };
    const trace = (event, details = {}) => {
      if (fault?.trace && fault.trace.length < 256)
        fault.trace.push({ event, ...details });
    };
    lifecycle.trace = trace;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // CLI requests are bounded. A failed transport is never terminality evidence.
    const cli = (params) =>
      new Promise((resolve, reject) => {
        execFile(
          "docker",
          params,
          {
            cwd: root,
            env: environment,
            encoding: "utf8",
            timeout: 1000,
            maxBuffer: 65536,
          },
          (error, stdout, stderr) => {
            if (error) {
              error.stderr = stderr;
              reject(error);
            } else resolve(stdout.trim());
          },
        );
      });
    lifecycle.cli = cli;
    const timer = setTimeout(
      () => requestTermination("PARSER_TIMEOUT"),
      fault?.wallMs ?? profile.wallMs,
    );
    const cancel = () => requestTermination("PARSER_TIMEOUT");
    fault?.signal?.addEventListener("abort", cancel, { once: true });
    if (fault?.signal?.aborted) cancel();
    // Preserve this continuation even if bounded supervision reports UNKNOWN.
    // A late create acknowledgement can NEVER authorize a start after cancellation.
    lifecycle.launch = (async () => {
      let launchArgs, launchDelay;
      if (fault?.runDelayMs) {
        // Test-only previously accepted atomic create/start request. Even this
        // late runnable transition remains owned by the exact supervisor.
        lifecycle.startIssued = true;
        launchArgs = ["run", ...args.slice(1)];
        launchDelay = fault.runDelayMs;
        trace("start-pending");
      } else {
        if (fault?.createDelayMs) await delay(fault.createDelayMs);
        lifecycle.id = await cli(args);
        assert.match(lifecycle.id, /^[0-9a-f]{64}$/);
        trace("created", { id: lifecycle.id });
        lifecycle.wake();
        if (lifecycle.requested) {
          trace("start-withheld");
          return;
        }
        lifecycle.startIssued = true;
        launchArgs = ["start", "--attach", "--interactive", lifecycle.id];
        launchDelay = fault?.startDelayMs;
        trace("start-pending", { id: lifecycle.id });
      }
      const options = { cwd: root, env: environment, stdio: ["pipe", "pipe", "pipe"] };
      let child;
      if (fault?.startGate) await fault.startGate;
      if (launchDelay) {
        const script =
          'const {spawn}=require("node:child_process");setTimeout(()=>{const c=spawn("docker",' +
          JSON.stringify(launchArgs) +
          ',{stdio:"inherit"});c.on("exit",n=>process.exit(n??1));},' +
          launchDelay +
          ");";
        child = spawn(process.execPath, ["-e", script], options);
      } else child = spawn("docker", launchArgs, options);
      lifecycle.child = child;
      lifecycle.wake();
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          lifecycle.size += chunk.length;
          if (lifecycle.size > profile.outputBytes)
            requestTermination("PARSER_OUTPUT_LIMIT");
          else if (stream === child.stdout) lifecycle.output += chunk.toString("utf8");
          else if (chunk.length) lifecycle.hasStderr = true;
        });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(request) + "\n");
      lifecycle.exit = await new Promise((resolve, reject) => {
        child.once("close", resolve);
        child.once("error", reject);
      });
      if (lifecycle.exit === 1) lifecycle.startTransportUnknown = true;
    })()
      .catch(() => {
        if (lifecycle.startIssued) lifecycle.startTransportUnknown = true;
        else lifecycle.createFailed = true;
      })
      .finally(() => {
        lifecycle.launchSettled = true;
        trace("launch-settled");
        lifecycle.wake();
      });
    let state;
    try {
      state = await settleLifecycle(
        lifecycle,
        (fault?.wallMs ?? profile.wallMs) + (fault?.graceMs ?? 10000),
      );
    } catch (error) {
      if (error.message === "PARSER_TERMINALITY_UNKNOWN") {
        handoffTermination(entry);
        assert.ok(terminationObligations.has(lifecycle));
      }
      throw error;
    } finally {
      clearTimeout(timer);
      fault?.signal?.removeEventListener("abort", cancel);
    }
    entry.terminal = true;
    await cli(["rm", lifecycle.id]);
    trace("removed", { id: lifecycle.id });
    const forced = lifecycle.requested,
      exit = lifecycle.exit,
      hasStderr = lifecycle.hasStderr,
      output = lifecycle.output;
    if (forced) return { status: forced, terminal: true };
    if (exit !== 0)
      return {
        status: state.OOMKilled ? "PARSER_RESOURCE_LIMIT" : "PARSER_CRASH",
        terminal: true,
      };
    if (hasStderr) return { status: "PARSER_PROTOCOL", terminal: true };
    try {
      const result = validateResult(
        output,
        requestFor(token, entry.pins.inputHash, count, entry.pins.declaredMime),
      );
      return { status: result.status, result, terminal: true };
    } catch {
      return { status: "PARSER_PROTOCOL", terminal: true };
    }
  }
  async function settleLifecycle(run, budgetMs, persistent = false) {
    const deadline = Date.now() + budgetMs;
    let backoff = 100;
    while (persistent || Date.now() < deadline) {
      let inspected = null,
        absent = false;
      try {
        if (run.requested && run.fault?.inspectFailure)
          throw new Error("injected transport failure");
        const json = await run.cli(["inspect", run.id ?? run.name]);
        inspected = JSON.parse(json)[0];
        assert.equal(inspected.Config.Labels["org.otr.run-token"], run.token);
        assert.equal(inspected.Name, "/" + run.name);
        if (run.id) assert.equal(inspected.Id, run.id);
        else {
          run.id = inspected.Id;
          run.trace("created", { id: run.id });
        }
        run.trace("inspected", {
          id: inspected.Id,
          running: inspected.State.Running,
          status: inspected.State.Status,
          startedAt: inspected.State.StartedAt,
        });
      } catch (error) {
        inspected = null;
        // Only explicit Docker not-found is absence; timeout/transport/identity
        // errors remain unknown, never a cleanup permit.
        absent = /No such (object|container)/i.test(error.stderr ?? "");
        run.trace(absent ? "not-created" : "inspect-unknown");
      }
      if (
        inspected &&
        run.launchSettled &&
        !run.createFailed &&
        (!run.startTransportUnknown || inspected.State.Status === "exited") &&
        inspected.State.Running === false
      ) {
        run.trace("terminal-proof", { id: inspected.Id });
        return inspected.State;
      }
      if (run.requested && (inspected || absent)) {
        try {
          if (run.fault?.killFailure) throw new Error("injected transport failure");
          const target = inspected?.Id ?? run.name;
          await run.cli(["kill", target]);
          run.trace("kill-succeeded", { id: target });
        } catch {
          run.trace("kill-failed");
        }
        // In particular: not found / created-not-running / kill transport error
        // do NOT settle the pending launch or stop subsequent termination attempts.
      }
      await waitForLifecycle(run, persistent ? backoff : 100);
      if (persistent) backoff = Math.min(backoff * 2, 1000);
    }
    run.requested ??= "PARSER_TIMEOUT";
    run.trace("terminality-unknown");
    throw new Error("PARSER_TERMINALITY_UNKNOWN");
  }
  function waitForLifecycle(run, ms) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        run.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      run.waiters.add(done);
    });
  }
  function handoffTermination(entry) {
    const run = entry.lifecycle;
    assert.ok(run.requested && !entry.terminal);
    assert.equal(terminationObligations.has(run), false);
    // Register synchronously BEFORE the caller receives UNKNOWN. This promise
    // owns both the pending launch/child and all later exact termination work.
    const obligation = {};
    terminationObligations.set(run, obligation);
    run.trace("termination-handoff", { id: run.id });
    obligation.done = (async () => {
      const state = await settleLifecycle(run, 0, true);
      // Even removal transport failure retains the obligation. Never detach an
      // unresolved owner, discard input, or infer terminality from a deadline.
      for (;;) {
        try {
          await run.cli(["rm", run.id]);
          break;
        } catch {
          run.trace("remove-unknown");
          await waitForLifecycle(run, 1000);
        }
      }
      entry.terminal = true;
      run.trace("removed", { id: run.id });
      terminationObligations.delete(run);
      run.trace("termination-obligation-resolved", { id: run.id });
      return { status: run.requested, terminal: true, oom: state.OOMKilled };
    })();
  }
  async function reconcileTerminationForTest(handle, budgetMs = 10000) {
    const run = exact(handle).lifecycle;
    const obligation = terminationObligations.get(run);
    assert.ok(obligation, "active exact termination owner required");
    run.wake();
    let timer;
    try {
      return await Promise.race([
        obligation.done,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("PARSER_TERMINALITY_UNKNOWN")),
            budgetMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function drainTerminationObligationsForTest(budgetMs = 10000) {
    let timer;
    for (const run of terminationObligations.keys()) run.wake();
    try {
      await Promise.race([
        Promise.all([...terminationObligations.values()].map((o) => o.done)),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("PARSER_TERMINALITY_UNKNOWN")),
            budgetMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    assert.equal(terminationObligations.size, 0);
  }
  function activeTerminationObligationsForTest() {
    return terminationObligations.size;
  }
  function fixtureNoDispatchQuiescence(handle) {
    const entry = exact(handle);
    assert.ok(entry.terminal, "exact local process still live");
    // Synthetic fixture owns NO provider connector. Not a C-I3D transition/proof.
    entry.phase = "IO_QUIESCENT";
  }
  async function cleanupFixture(handle, requiredReference = false) {
    const entry = exact(handle);
    assert.ok(
      entry.terminal && entry.phase === "IO_QUIESCENT" && !requiredReference,
      "protected staging/reference",
    );
    if (entry.path) await rm(entry.path, { recursive: true });
    slots.delete(entry.pins.representationId);
    owned.delete(handle);
  }
  return {
    reserveForTest,
    runOwned,
    fixtureNoDispatchQuiescence,
    reconcileTerminationForTest,
    activeTerminationObligationsForTest,
    drainTerminationObligationsForTest,
    cleanupFixture,
    image,
    profileHash: profileHash(),
  };
}
