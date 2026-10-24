import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  prepareUniversalTaskHost,
  classifyPreparationFailure,
  UniversalPreparationUnconfirmed,
} from "./universalPreparationOperator";

// Loader I/O synthetic. Real SQLite/custody and isolated owning PG are separate receipts.
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    id = randomUUID();
  const binding = {
    version: "otr.backend.universal-context/1",
    actorId: actor,
    accountId: actor,
    tripId: trip,
    batchId: batch,
    taskId: id,
  };
  const source = {
    prepareInputs: vi.fn(async () => ({})),
    readPreparedInputs: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
  };
  const task = {
    universalImportPort: {
      readContext: vi.fn(async () => binding),
      execute: vi.fn(),
      read: vi.fn(),
    },
    close: vi.fn(async () => {}),
  };
  const loaders = {
    config: vi.fn(async () => ({
      actorId: actor,
      task: { account_id: actor, trip_id: trip, import_id: batch, task_id: id },
    })),
    source: vi.fn(async () => source),
    task: vi.fn(async () => task),
  };
  const run = (mode: "PREPARE_ONCE" | "RECOVER_ONLY") =>
    prepareUniversalTaskHost(
      mode,
      {},
      loaders as unknown as NonNullable<Parameters<typeof prepareUniversalTaskHost>[2]>,
    );
  return { source, task, loaders, run, binding };
}
it("missing same private capability stays CLOSED, with no Source/Task access", async () => {
  const f = fixture();
  f.loaders.config.mockResolvedValueOnce(undefined as never);
  expect(await f.run("PREPARE_ONCE")).toEqual({ status: "CLOSED" });
  expect(f.loaders.source).not.toHaveBeenCalled();
  expect(f.loaders.task).not.toHaveBeenCalled();
});
it("explicit prepare calls once, independently reads Run, closes Source phase then bootstraps existing Task", async () => {
  const f = fixture();
  f.loaders.task.mockImplementationOnce(async () => {
    expect(f.source.close).toHaveBeenCalledOnce();
    return f.task;
  });
  expect(await f.run("PREPARE_ONCE")).toEqual({
    status: "TASK_CONTEXT_READY",
    sourceOutcome: "PREPARED",
    binding: f.binding,
  });
  expect(f.source.prepareInputs).toHaveBeenCalledOnce();
  expect(f.source.readPreparedInputs).toHaveBeenCalledOnce();
  expect(f.task.close).toHaveBeenCalledOnce();
  expect(f.task.universalImportPort.execute).not.toHaveBeenCalled();
});
it("unknown begin is reconciled by owning read without a mutation retry", async () => {
  const f = fixture();
  f.source.prepareInputs.mockRejectedValueOnce(Error("connection lost"));
  expect(await f.run("PREPARE_ONCE")).toMatchObject({ sourceOutcome: "RECONCILED" });
  expect(f.source.prepareInputs).toHaveBeenCalledOnce();
});
it("unconfirmed Run stops before Task; subsequent recover remains Source-read-only", async () => {
  const f = fixture();
  f.source.prepareInputs.mockRejectedValueOnce(Error("UNKNOWN"));
  f.source.readPreparedInputs.mockRejectedValueOnce(Error("unavailable"));
  await expect(f.run("PREPARE_ONCE")).rejects.toThrow("UNCONFIRMED");
  expect(f.loaders.task).not.toHaveBeenCalled();
  expect(f.source.close).toHaveBeenCalledOnce();
  expect(await f.run("RECOVER_ONLY")).toMatchObject({ sourceOutcome: "READ_ONLY" });
  expect(f.source.prepareInputs).toHaveBeenCalledOnce();
});
it("Source close failure cannot proceed to Task stage", async () => {
  const f = fixture();
  f.source.close.mockRejectedValueOnce(Error("close failed"));
  await expect(f.run("PREPARE_ONCE")).rejects.toThrow("close failed");
  expect(f.loaders.task).not.toHaveBeenCalled();
});
it("missing or substituted real Task context blocks and closes Task runtime", async () => {
  const f = fixture();
  f.task.universalImportPort.readContext.mockResolvedValueOnce(null as never);
  await expect(f.run("RECOVER_ONLY")).rejects.toThrow("OWNING_TASK_READER_UNAVAILABLE");
  expect(f.task.close).toHaveBeenCalledOnce();
  expect(f.source.prepareInputs).not.toHaveBeenCalled();
  f.task.universalImportPort.readContext.mockResolvedValueOnce({
    ...f.binding,
    taskId: randomUUID(),
  });
  await expect(f.run("RECOVER_ONLY")).rejects.toThrow("OWNING_TASK_READER_UNAVAILABLE");
  expect(f.task.close).toHaveBeenCalledTimes(2);
});

it("unconfirmed stages retain only allowlisted owning or SQLSTATE categories", async () => {
  const f = fixture();
  f.source.prepareInputs.mockRejectedValueOnce(
    Object.assign(Error("private SQL query and credential"), {
      code: "42702",
      detail: "secret",
    }),
  );
  f.source.readPreparedInputs.mockRejectedValueOnce(
    Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE"),
  );
  try {
    await f.run("PREPARE_ONCE");
    throw Error("EXPECTED_REFUSAL");
  } catch (error) {
    expect(error).toBeInstanceOf(UniversalPreparationUnconfirmed);
    expect((error as UniversalPreparationUnconfirmed).diagnostic).toEqual({
      begin: "SQLSTATE_42702",
      read: "UNIVERSAL_SOURCE_RUN_UNAVAILABLE",
    });
    expect(JSON.stringify(error)).not.toContain("private");
    expect(JSON.stringify(error)).not.toContain("secret");
  }
  expect(f.source.prepareInputs).toHaveBeenCalledOnce();
  expect(f.source.readPreparedInputs).toHaveBeenCalledOnce();
  expect(f.loaders.task).not.toHaveBeenCalled();
  expect(f.source.close).toHaveBeenCalledOnce();
});
it("diagnostic rejects arbitrary messages/codes and recover never begins", async () => {
  expect(classifyPreparationFailure({ message: "Bearer private", code: "PRIVATE" })).toBe(
    "UNCLASSIFIED",
  );
  expect(classifyPreparationFailure({ message: "SOURCE_ACCESS_DENIED private" })).toBe(
    "UNCLASSIFIED",
  );
  expect(classifyPreparationFailure({ code: "28P01", message: "password raw" })).toBe(
    "SQLSTATE_28P01",
  );
  const f = fixture();
  f.source.readPreparedInputs.mockRejectedValueOnce({
    code: "ECONNRESET",
    message: "raw private",
  });
  await expect(f.run("RECOVER_ONLY")).rejects.toMatchObject({
    diagnostic: { begin: "NOT_ATTEMPTED", read: "ECONNRESET" },
  });
  expect(f.source.prepareInputs).not.toHaveBeenCalled();
});
