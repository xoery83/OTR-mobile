import { createSourcePngPrivateStage } from "./sourcePngPrivateStage";
import { createSourcePdfPrivateStage } from "./sourcePdfPrivateStage";
// Fake Docker observations verify ordering/failure handling, never claim a real Source receipt.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createSourcePngOwnedSandbox,
  terminateSourcePngAttempt,
} from "./sourcePngOwnedSandbox";
import {
  sourcePngStorageBindingSchema,
  SOURCE_PNG_SANDBOX_IMAGE,
} from "./sourcePngStorageProducer";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
const fake = vi.hoisted(() => ({
  command: vi.fn<(args: string[], input?: string) => string>(),
  events: [] as string[],
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _bin: string,
    args: string[],
    _options: unknown,
    callback: (error: unknown, stdout?: string) => void,
  ) => ({
    stdin: {
      on: vi.fn(),
      end(input?: string) {
        queueMicrotask(() => {
          try {
            fake.events.push(args[0]);
            callback(null, fake.command(args, input));
          } catch (error) {
            callback(error);
          }
        });
      },
    },
  }),
}));
const bytes = Uint8Array.from(
  readFileSync(
    new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
  ),
);
const hash = createHash("sha256").update(bytes).digest("hex"),
  cid = "a".repeat(64);
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.events.length = 0;
});
async function fixture(fault?: "badFact" | "startFailure" | "unknownCleanup") {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "otr-png-owned-")));
  dirs.push(directory);
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
  let token = "";
  fake.command.mockImplementation((args, input) => {
    if (args[0] === "create") {
      token = args[args.indexOf("--label") + 1].split("=")[1];
      return cid + "\n";
    }
    if (args[0] === "start") {
      if (fault === "startFailure") throw Error("client timeout");
      const q = JSON.parse(input!);
      return (
        JSON.stringify({
          protocol_version: 1,
          profile_version: 1,
          profile_sha256: q.profile_sha256,
          input_token: q.input_token,
          input_sha256: q.input_sha256,
          byte_count: q.byte_count,
          actual_mime: "image/png",
          format: "PNG",
          facts: {
            width: 1000,
            height: 600,
            pixels: fault === "badFact" ? 1 : 600000,
            frames: 1,
            channels: 4,
            bit_depth: 8,
            interlace: 0,
            decoded_byte_count: 2400000,
          },
          status: "PARSE_PASS",
        }) + "\n"
      );
    }
    if (args[0] === "inspect")
      return JSON.stringify([
        { Id: cid, Config: { Labels: { "org.otr.png-owner": token } } },
      ]);
    if (args[0] === "rm" && fault === "unknownCleanup") throw Error("daemon unavailable");
    return "";
  });
  const owner = {
    assertCurrent: vi.fn(async () => {
      fake.events.push("current");
    }),
    attach: vi.fn(async () => {
      fake.events.push("attach");
    }),
    running: vi.fn(async () => {
      fake.events.push("running");
    }),
    terminal: vi.fn(async () => {
      fake.events.push("terminal");
    }),
  };
  return {
    directory,
    binding,
    owner,
    run: createSourcePngOwnedSandbox(directory, owner),
  };
}
it("attaches and durably advances the owned journal before starting, proves cleanup before terminal", async () => {
  const f = await fixture();
  expect(await f.run(f.binding, bytes)).toMatchObject({
    imageId: SOURCE_PNG_SANDBOX_IMAGE,
    terminated: true,
    result: { status: "PARSE_PASS" },
  });
  const events = fake.events;
  expect(events.indexOf("attach")).toBeLessThan(events.indexOf("start"));
  expect(events.indexOf("running")).toBeLessThan(events.indexOf("start"));
  expect(events.indexOf("rm")).toBeLessThan(events.indexOf("terminal"));
  expect(events.indexOf("ps")).toBeLessThan(events.indexOf("terminal"));
  const create = fake.command.mock.calls.find(([args]) => args[0] === "create")![0];
  expect(create).toEqual(
    expect.arrayContaining([
      "--network=none",
      "--read-only",
      "--pull=never",
      "--memory=128m",
      "--pids-limit=16",
      SOURCE_PNG_SANDBOX_IMAGE,
    ]),
  );
  expect(await readdir(f.directory)).toEqual([]);
});
it("invalid decoded facts cannot seal PARSE_PASS even after actual cleanup", async () => {
  const f = await fixture("badFact");
  await expect(f.run(f.binding, bytes)).rejects.toThrow("PNG_SANDBOX_IDENTITY_MISMATCH");
  expect(f.owner.terminal).toHaveBeenCalledWith(
    f.binding,
    expect.objectContaining({ result: "PARSER_PROTOCOL" }),
  );
});
it("client failure still proves OS termination and records only a negative result", async () => {
  const f = await fixture("startFailure");
  await expect(f.run(f.binding, bytes)).rejects.toThrow("PNG_SANDBOX_UNAVAILABLE");
  expect(f.owner.terminal).toHaveBeenCalledWith(
    f.binding,
    expect.objectContaining({ result: "PARSER_CRASH" }),
  );
  expect(await readdir(f.directory)).toEqual([]);
});
it("unknown termination retains its decoder input for recovery and never records terminal", async () => {
  const f = await fixture("unknownCleanup");
  await expect(f.run(f.binding, bytes)).rejects.toThrow(
    "PNG_SANDBOX_TERMINATION_UNKNOWN",
  );
  expect(f.owner.terminal).not.toHaveBeenCalled();
  expect(await readdir(f.directory)).toHaveLength(1);
});
it("closed ownership or changed bytes cannot create a container", async () => {
  const f = await fixture();
  f.owner.assertCurrent.mockRejectedValue(Error("SOURCE_CAPABILITY_CLOSED"));
  await expect(f.run(f.binding, bytes)).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
  await expect(f.run(f.binding, bytes.subarray(1))).rejects.toThrow("PNG_INPUT_IDENTITY");
  expect(fake.command).not.toHaveBeenCalled();
});
it("failed journal attach cannot start the process or manufacture terminal proof", async () => {
  const f = await fixture();
  f.owner.attach.mockRejectedValue(Error("OWNER_CONFLICT"));
  await expect(f.run(f.binding, bytes)).rejects.toThrow("OWNER_CONFLICT");
  expect(fake.events).not.toContain("start");
  expect(f.owner.terminal).not.toHaveBeenCalled();
  expect(await readdir(f.directory)).toEqual([]);
});

it("a scope closed while running is pending cannot subsequently start Docker", async () => {
  const f = await fixture();
  f.owner.running.mockImplementation(async () => {
    f.owner.assertCurrent.mockRejectedValue(Error("SOURCE_CAPABILITY_CLOSED"));
  });
  await expect(f.run(f.binding, bytes)).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
  expect(fake.events).not.toContain("start");
  expect(f.owner.terminal).toHaveBeenCalledWith(
    f.binding,
    expect.objectContaining({ result: "PARSER_CRASH" }),
  );
});
it("only an explicit identity-bound decoder format rejection records FORMAT_REJECTED", async () => {
  const f = await fixture();
  const respond = fake.command.getMockImplementation()!;
  fake.command.mockImplementation((args, input) => {
    if (args[0] !== "start") return respond(args, input);
    const q = JSON.parse(input!);
    return (
      JSON.stringify({
        protocol_version: 1,
        profile_version: 1,
        profile_sha256: q.profile_sha256,
        input_token: q.input_token,
        input_sha256: q.input_sha256,
        byte_count: q.byte_count,
        actual_mime: null,
        format: null,
        facts: null,
        status: "FORMAT_UNSUPPORTED",
      }) + "\n"
    );
  });
  await expect(f.run(f.binding, bytes)).rejects.toThrow();
  expect(f.owner.terminal).toHaveBeenCalledWith(
    f.binding,
    expect.objectContaining({ result: "FORMAT_REJECTED" }),
  );
});
it.each(["timeout", "protocol"])(
  "records %s independently from image format",
  async (fault) => {
    const f = await fixture();
    const respond = fake.command.getMockImplementation()!;
    fake.command.mockImplementation((args, input) => {
      if (args[0] !== "start") return respond(args, input);
      if (fault === "timeout")
        throw Object.assign(Error("bounded client timeout"), { killed: true });
      return "{}\n{}\n";
    });
    await expect(f.run(f.binding, bytes)).rejects.toThrow();
    expect(f.owner.terminal).toHaveBeenCalledWith(
      f.binding,
      expect.objectContaining({
        result: fault === "timeout" ? "PARSER_TIMEOUT" : "PARSER_PROTOCOL",
      }),
    );
    expect(await readdir(f.directory)).toEqual([]);
  },
);

it("keeps the canonical durable PNG stage after its disposable decoder copy is removed", async () => {
  const f = await fixture(),
    root = join(f.directory, "retained"),
    stage = createSourcePngPrivateStage(root);
  const stream = async function* () {
    yield bytes.subarray(0, 20000);
    yield bytes.subarray(20000);
  };
  const seal = await stage.seal(f.binding, stream());
  expect(seal).toMatchObject({
    resourceId: f.binding.resourceId,
    sha256: hash,
    byteCount: bytes.length,
  });
  expect(await stage.reopen(f.binding)).toEqual(Buffer.from(bytes));
  await f.run(f.binding, await stage.reopen(f.binding));
  expect(await readdir(f.directory)).toEqual(["retained"]);
  expect(await stage.reopen(f.binding)).toEqual(Buffer.from(bytes));
  await expect(
    stage.reopen({ ...f.binding, resourceKey: "d".repeat(64) }),
  ).rejects.toThrow("STAGE_BINDING_MISMATCH");
  await expect(
    createSourcePdfPrivateStage(root).reopen(f.binding as never),
  ).rejects.toThrow();
});

it.each(["valid", "foreignImage", "stillPresent"] as const)(
  "negative-only cleanup matches exact owned attempt: %s",
  async (mode) => {
    const f = await fixture();
    let removed = false;
    const token = "d".repeat(32);
    fake.command.mockImplementation((args) => {
      if (args[0] === "ps") return removed && mode !== "stillPresent" ? "" : cid + "\n";
      if (args[0] === "inspect")
        return JSON.stringify([
          {
            Id: cid,
            Image:
              mode === "foreignImage"
                ? "sha256:" + "f".repeat(64)
                : SOURCE_PNG_SANDBOX_IMAGE,
            Name: "/otr-source-png-" + token,
            Config: {
              Labels: {
                "org.otr.png-owner": token,
                "org.otr.png-attempt": f.binding.attemptId,
                "org.otr.png-resource": f.binding.resourceId,
                "org.otr.png-operation": f.binding.operationId,
              },
            },
          },
        ]);
      if (args[0] === "rm") {
        removed = true;
        return "";
      }
      throw Error("unexpected Docker operation");
    });
    if (mode === "valid")
      expect(await terminateSourcePngAttempt(f.binding)).toEqual({ terminated: true });
    else
      await expect(terminateSourcePngAttempt(f.binding)).rejects.toThrow(
        "PNG_SANDBOX_TERMINATION_UNKNOWN",
      );
    expect(f.owner.terminal).not.toHaveBeenCalled();
    expect(removed).toBe(mode !== "foreignImage");
    const list = fake.command.mock.calls.find(([args]) => args[0] === "ps")![0];
    expect(list).toContain("label=org.otr.png-attempt=" + f.binding.attemptId);
    expect(list).toContain("label=org.otr.png-resource=" + f.binding.resourceId);
    expect(list).toContain("label=org.otr.png-operation=" + f.binding.operationId);
  },
);
