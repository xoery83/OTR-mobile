import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { cleanupSourcePngWorkerHost } from "./sourcePngWorkerCleanupMain";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID(),
    source = randomUUID(),
    rep = randomUUID();
  const binding = {
    operationId: randomUUID(),
    operationKey: "synthetic",
    operationSha256: "a".repeat(64),
    actorAccountId: actor,
    tripId: trip,
    sourceId: source,
    representationId: rep,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway",
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "b".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${trip}/${source}/${rep}/payload`,
    sha256: "c".repeat(64),
    byteCount: 42630,
    mimeType: "image/png",
    profileId: "PNG_STATIC_RGB8_RGBA8_V1",
    profileSha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
  };
  let content: Buffer = Buffer.from(JSON.stringify(binding));
  const stat = {
    uid: 0,
    gid: 0,
    mode: 0o100600,
    nlink: 1,
    size: content.length,
    dev: 1,
    ino: 2,
    mtimeMs: 1,
    ctimeMs: 1,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
  const parent = {
    uid: 0,
    gid: 999,
    mode: 0o40750,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  };
  const file = {
    stat: vi.fn(async () => ({ ...stat })),
    close: vi.fn(async () => {}),
    read: vi.fn(
      async (target: Buffer, offset: number, length: number, position: number) => {
        const bytesRead = content.copy(target, offset, position, position + length);
        return { bytesRead, buffer: target };
      },
    ),
  };
  const files = {
    lstat: vi.fn(async (path: string) =>
      path.endsWith("active-worker") ? { ...stat } : parent,
    ),
    realpath: vi.fn(async (path: string) => path),
    open: vi.fn(async () => file),
  };
  const inventory = vi.fn(async (): Promise<readonly string[]> => []);
  const terminate = vi.fn(async () => ({ terminated: true as const }));
  const runtime = { platform: "linux", getuid: () => 0 } as Parameters<
    typeof cleanupSourcePngWorkerHost
  >[0];
  const run = () =>
    cleanupSourcePngWorkerHost(
      runtime,
      files as unknown as Parameters<typeof cleanupSourcePngWorkerHost>[1],
      terminate,
      inventory,
    );
  return {
    binding,
    runtime,
    files,
    file,
    stat,
    parent,
    terminate,
    inventory,
    run,
    content: (bytes: Buffer) => {
      content = bytes;
      stat.size = bytes.length;
    },
  };
}
it("reads only the fixed protected marker and delegates its exact binding", async () => {
  const f = fixture();
  expect(await f.run()).toEqual({ status: "TERMINATED", terminated: true });
  expect(f.files.open).toHaveBeenCalledExactlyOnceWith(
    "/run/otr/universal-png-worker/active-worker",
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  expect(f.terminate).toHaveBeenCalledExactlyOnceWith(f.binding);
  expect(f.file.close).toHaveBeenCalledOnce();
});
it("no marker is verified empty only by independent fixed-namespace inventory", async () => {
  const f = fixture();
  f.files.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  expect(await f.run()).toEqual({ status: "EMPTY_VERIFIED", terminated: true });
  expect(f.terminate).not.toHaveBeenCalled();
});
it.each([{ uid: 501 }, { mode: 0o100644 }, { nlink: 2 }, { size: 16385 }])(
  "rejects unsafe marker metadata %j",
  async (change) => {
    const f = fixture();
    Object.assign(f.stat, change);
    expect(await f.run()).toEqual({ status: "UNKNOWN", terminated: false });
    expect(f.terminate).not.toHaveBeenCalled();
  },
);
it("refuses a changed marker between fd read and path recheck", async () => {
  const f = fixture();
  f.files.lstat.mockImplementation(async (path) =>
    path.endsWith("active-worker") ? { ...f.stat, ino: 9 } : f.parent,
  );
  expect((await f.run()).status).toBe("UNKNOWN");
  expect(f.terminate).not.toHaveBeenCalled();
});
it("malformed and duplicate-key JSON are never cleanup permits", async () => {
  const f = fixture();
  f.content(Buffer.from('{"operationId":"a","operationId":"b"}'));
  expect((await f.run()).status).toBe("UNKNOWN");
  expect(f.terminate).not.toHaveBeenCalled();
});
it("termination uncertainty keeps the marker open only for reading and reports UNKNOWN", async () => {
  const f = fixture();
  f.terminate.mockRejectedValueOnce(Error("PNG_SANDBOX_TERMINATION_UNKNOWN"));
  expect(await f.run()).toEqual({ status: "UNKNOWN", terminated: false });
  expect(Object.keys(f.files).sort()).toEqual(["lstat", "open", "realpath"]);
  expect(f.file.close).toHaveBeenCalledOnce();
});
it("non-root or non-Linux callers have no filesystem or cleanup effects", async () => {
  for (const change of [{ platform: "darwin" }, { getuid: () => 501 }]) {
    const f = fixture();
    Object.assign(f.runtime!, change);
    expect((await f.run()).status).toBe("UNKNOWN");
    expect(f.files.lstat).not.toHaveBeenCalled();
    expect(f.terminate).not.toHaveBeenCalled();
  }
});

it("a nonempty namespace without marker is not a deletion permit", async () => {
  const f = fixture();
  f.files.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  f.inventory.mockResolvedValueOnce(["a".repeat(64)]);
  expect(await f.run()).toEqual({ status: "UNVERIFIED", terminated: false });
  expect(f.terminate).not.toHaveBeenCalled();
});
it("exact marker cleanup does not delete another remaining namespace attempt", async () => {
  const f = fixture();
  f.inventory.mockResolvedValueOnce(["a".repeat(64)]);
  expect(await f.run()).toEqual({ status: "UNVERIFIED", terminated: false });
  expect(f.terminate).toHaveBeenCalledExactlyOnceWith(f.binding);
});
it("independent inventory failure is UNKNOWN even without a marker", async () => {
  const f = fixture();
  f.files.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  f.inventory.mockRejectedValueOnce(Error("PNG_SANDBOX_INVENTORY_UNKNOWN"));
  expect(await f.run()).toEqual({ status: "UNKNOWN", terminated: false });
  expect(f.terminate).not.toHaveBeenCalled();
});
