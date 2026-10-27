import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createUniversalPersistenceHost } from "./universalPersistenceHost";
import { createUniversalDeepSeekProvider } from "./universalDeepSeekProvider";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import type { Attempt, Task } from "../../src/domain/intelligence/persistence";

it("actual persistence/custody adapter withholds credentials/send/retention after owning current-scope kill", async () => {
  // Partial local diagnostic identities are used only to reach a rejecting SQL port.
  // Actual post-mark SQL kill behavior is independently exercised by the PG acceptance script.
  const a = {
    account_id: randomUUID(),
    task_id: randomUUID(),
    attempt_id: randomUUID(),
    usage_correlation_id: randomUUID(),
  } as Attempt;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("universal_import_read_scope")) throw Error("CP14_ADMISSION_CLOSED");
    return { rows: [] };
  });
  const credential = vi.fn(),
    put = vi.fn(),
    retain = vi.fn(),
    send = vi.fn();
  const host = createUniversalPersistenceHost({
    connection: { withLease: async (work) => work({ query, retire() {} }) },
    gateway: { invoke: vi.fn() } as never,
    stores: { custody: { put, read: vi.fn() }, retainRaw: retain } as never,
    attempt: a,
    requestMaterialByteCount: 1,
    currentTask: async () => ({}) as Task,
    environment: (key) =>
      key === "OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT" ? "enabled" : credential(),
  });
  const provider = createUniversalDeepSeekProvider({ custody: host.custody, send });
  await expect(
    provider.interpret({
      actorId: a.account_id,
      accountId: a.account_id,
      tripId: randomUUID(),
      batchId: randomUUID(),
      taskId: a.task_id,
      promptVersion: COMPACT_PROMPT_VERSION,
      instruction: universalInstruction,
      advisoryInstruction: universalAdvisoryInstruction,
      sources: [
        {
          sourceId: "S0",
          index: 0,
          mime: "text/plain",
          modality: "TEXT",
          sha256: createHash("sha256").update("Museum walk").digest("hex"),
          bytes: Buffer.from("Museum walk"),
        },
      ],
    }),
  ).rejects.toThrow("CP14_ADMISSION_CLOSED");
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("universal_import_read_scope"),
    [a.account_id, a.task_id, a.attempt_id, a.usage_correlation_id],
  );
  expect(send).not.toHaveBeenCalled();
  expect(credential).not.toHaveBeenCalled();
  await expect(
    host.custody.retainResponse({
      accountId: a.account_id,
      taskId: a.task_id,
      requestSha256: "0".repeat(64),
      responseSha256: "0".repeat(64),
      httpStatus: 200,
      bytes: Buffer.from("response"),
    }),
  ).rejects.toThrow("CP14_ADMISSION_CLOSED");
  expect(put).not.toHaveBeenCalled();
  expect(retain).not.toHaveBeenCalled();
});
