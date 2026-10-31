import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  mkdtemp,
  rm,
  mkdir,
  chmod,
  chown,
  realpath,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSourcePngWorkerClient,
  createSourcePngWorkerServer,
} from "./sourcePngWorkerTransport";
import {
  sourcePngStorageBindingSchema,
  SOURCE_PNG_SANDBOX_IMAGE,
} from "./sourcePngStorageProducer";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import { startSourcePngWorkerHost } from "./sourcePngWorkerHost";
import type { SourcePngExecutionOwner } from "./sourcePngOwnedSandbox";
const bytes = readFileSync(
  new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
);
const hash = createHash("sha256").update(bytes).digest("hex");
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
function observation() {
  return {
    imageId: SOURCE_PNG_SANDBOX_IMAGE,
    terminated: true as const,
    result: {
      protocol_version: 1,
      profile_version: 1,
      profile_sha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
      input_token: "a".repeat(32),
      input_sha256: hash,
      byte_count: bytes.length,
      actual_mime: "image/png",
      format: "PNG",
      status: "PARSE_PASS",
      facts: {
        width: 1000,
        height: 600,
        pixels: 600000,
        frames: 1,
        channels: 4,
        bit_depth: 8,
        interlace: 0,
        decoded_byte_count: 2400000,
      },
    },
  };
}
function bindingFixture() {
  const tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID();
  const binding = sourcePngStorageBindingSchema.parse({
    operationId: randomUUID(),
    operationKey: "png-upload:fixture",
    operationSha256: "b".repeat(64),
    actorAccountId: randomUUID(),
    tripId,
    sourceId,
    representationId,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway",
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "c".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${tripId}/${sourceId}/${representationId}/payload`,
    sha256: hash,
    byteCount: bytes.length,
    mimeType: "image/png",
    profileId: "PNG_STATIC_RGB8_RGBA8_V1",
    profileSha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
  });
  return binding;
}

async function fixture(
  fault?: "lostFinal" | "ownerReject" | "terminationUnknown",
  hosted = false,
) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "otr-png-wire-"))),
    path = join(dir, "worker.sock"),
    events: string[] = [];
  const binding = bindingFixture();
  const run = (_dir: string, owner: SourcePngExecutionOwner) => async () => {
    await owner.assertCurrent(binding);
    await owner.attach(binding, "a".repeat(64));
    events.push("attached");
    await owner.assertCurrent(binding);
    await owner.running(binding);
    events.push("started");
    if (fault === "terminationUnknown") throw Error("PNG_SANDBOX_TERMINATION_UNKNOWN");
    await owner.terminal(binding, {
      containerId: "a".repeat(64),
      observedAt: "2026-10-31T00:00:00.000000Z",
      evidenceSha256: "b".repeat(64),
      result: "PARSE_PASS",
    });
    events.push("terminal");
    if (fault === "lostFinal") throw Error("lost response");
    return observation();
  };
  let server: ReturnType<typeof createSourcePngWorkerServer>;
  if (hosted) {
    await chown(dir, process.getuid!(), process.getgid!());
    await chmod(dir, 0o750);
    await mkdir(join(dir, "decoder-stage"), { mode: 0o700 });
    server = await startSourcePngWorkerHost(
      { directory: dir, ownerUid: process.getuid!(), socketGid: process.getgid!() },
      run,
    );
  } else {
    server = createSourcePngWorkerServer(dir, run);
    await new Promise<void>((resolve) => server.listen(path, resolve));
  }
  cleanup.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });
  const owner: SourcePngExecutionOwner = {
    assertCurrent: vi.fn(async () => {}),
    attach: vi.fn(async () => {
      if (fault === "ownerReject") throw Error("SOURCE_CLOSED");
    }),
    running: vi.fn(async () => {}),
    terminal: vi.fn(async () => {}),
  };
  return {
    dir,
    server,
    run,
    path,
    binding,
    owner,
    events,
    call: () =>
      createSourcePngWorkerClient(path)(
        binding,
        bytes,
        owner,
        new AbortController().signal,
      ),
  };
}
it("waits for real owning callbacks before Host start and confirms the terminal before returning bytes", async () => {
  const f = await fixture();
  expect(await f.call()).toEqual(observation());
  expect(f.events).toEqual(["attached", "started", "terminal"]);
  expect(f.owner.attach).toHaveBeenCalledOnce();
  expect(f.owner.running).toHaveBeenCalledOnce();
  expect(f.owner.terminal).toHaveBeenCalledOnce();
});
it("never starts when the Backend refuses attach", async () => {
  const f = await fixture("ownerReject");
  await expect(f.call()).rejects.toThrow("PNG_WORKER");
  expect(f.events).toEqual([]);
  expect(f.owner.running).not.toHaveBeenCalled();
});
it("lost result after terminal remains unconfirmed instead of hanging or re-running", async () => {
  const f = await fixture("lostFinal");
  await expect(f.call()).rejects.toThrow("PNG_WORKER");
  expect(f.owner.terminal).toHaveBeenCalledOnce();
});
it("unknown physical termination does not manufacture a terminal receipt", async () => {
  const f = await fixture("terminationUnknown");
  await expect(f.call()).rejects.toThrow("PNG_WORKER");
  expect(f.owner.terminal).not.toHaveBeenCalled();
});
it("rejects a pre-aborted request before opening the private socket", async () => {
  const f = await fixture();
  const abort = new AbortController();
  abort.abort();
  expect(() =>
    createSourcePngWorkerClient("/private/tmp/not-opened.sock")(
      f.binding,
      bytes,
      f.owner,
      abort.signal,
    ),
  ).toThrow();
  expect(f.owner.attach).not.toHaveBeenCalled();
});

it("Host successful completion removes its durable lease and restricts its socket", async () => {
  const f = await fixture(undefined, true);
  await f.call();
  await expect(readFile(join(f.dir, "active-worker"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("Host failed result keeps a durable lease and blocks a second execution", async () => {
  const f = await fixture("lostFinal", true);
  await expect(f.call()).rejects.toThrow();
  expect(JSON.parse(await readFile(join(f.dir, "active-worker"), "utf8"))).toEqual(
    f.binding,
  );
  const events = [...f.events];
  await expect(f.call()).rejects.toThrow();
  expect(f.events).toEqual(events);
});
it("Host restart cannot run over an UNKNOWN durable lease", async () => {
  const f = await fixture(undefined, true);
  await writeFile(join(f.dir, "active-worker"), "retained UNKNOWN");
  await new Promise<void>((resolve) => f.server.close(() => resolve()));
  const restarted = await startSourcePngWorkerHost(
    { directory: f.dir, ownerUid: process.getuid!(), socketGid: process.getgid!() },
    f.run,
  );
  cleanup.unshift(() => new Promise<void>((resolve) => restarted.close(() => resolve())));
  await expect(f.call()).rejects.toThrow();
  expect(f.events).toEqual([]);
  expect(await readFile(join(f.dir, "active-worker"), "utf8")).toBe("retained UNKNOWN");
});


it.each([31000, 90001])("bounds owning journal acknowledgements by the 90-second Source request budget: %i", async (elapsed) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  try {
    const f = await fixture();
    f.owner.running.mockImplementation(async () => { entered(); await waiting; });
    const result = f.call().then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );
    await started;
    await vi.advanceTimersByTimeAsync(elapsed);
    release();
    const settled = await result;
    if (elapsed < 90000) {
      expect(settled.error).toBeUndefined();
      expect(settled.value).toEqual(observation());
    } else {
      expect(settled.error).toBeInstanceOf(Error);
      expect(settled.value).toBeUndefined();
    }
  } finally {
    release?.();
    vi.useRealTimers();
  }
});
