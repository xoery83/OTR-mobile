import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createUniversalOriginalSourceRuntime } from "./universalOriginalSourceRuntime";
import type { universalFiniteConfigSchema } from "./universalFiniteConfig";
import type { z } from "zod";
const actor = randomUUID(),
  trip = randomUUID(),
  source = randomUUID(),
  representation = randomUUID(),
  run = randomUUID(),
  task = randomUUID(),
  batch = randomUUID();
const bytes = new TextEncoder().encode("Original text"),
  digest = createHash("sha256").update(bytes).digest("hex");
const command = {
  contract_version: 1,
  command: "ACQUIRE_SOURCE",
  actor_account_id: actor,
  trip_id: trip,
  source_id: source,
  operation_id: randomUUID(),
  operation_key: randomUUID(),
  operation_sha256: "a".repeat(64),
  payload: {
    acquisition_key: "fixed",
    acquisition_sha256: "a".repeat(64),
    source_input: {
      source_kind: "TEXT",
      acquisition_channel: "PASTE",
      captured_at: null,
      capture_time_basis: "UNKNOWN",
    },
    capture: { completeness: "AS_SUPPLIED", capture_sha256: "a".repeat(64) },
    original: {
      id: representation,
      material_kind: "TEXT",
      original_filename: null,
      part_key: null,
      mime_type: null,
      encoding: "UTF-8",
      payload_sha256: digest,
      byte_count: bytes.length,
      text_content: "Original text",
      locator_uri: null,
    },
  },
};
// Unit composition receives already-qualified fields; the shared private-file loader has separate qualification tests.
const capability = () =>
  ({
    actorId: actor,
    bearer: "synthetic",
    startsAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    task: {
      account_id: actor,
      trip_id: trip,
      task_id: task,
      run_id: run,
      import_id: batch,
      manifest_sha256: "b".repeat(64),
      input_pins: [
        {
          kind: "SOURCE",
          source_id: source,
          representation_id: representation,
          payload_sha256: digest,
          byte_count: bytes.length,
          material_revision: 1,
          input_id: randomUUID(),
          transform_sha256: null,
        },
      ],
    },
  }) as unknown as z.infer<typeof universalFiniteConfigSchema>;
function setup() {
  const calls: string[] = [],
    gateway = {
      validateAccessToken: vi.fn(async () => ({ id: actor })),
      canReadTrip: vi.fn(async () => true),
    };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("begin_universal")) {
      const q = JSON.parse(params?.[2] as string);
      expect(q).toMatchObject({ runId: run, batchId: batch, taskId: task });
      return {
        rows: [
          {
            result: { id: run, trip_id: trip, actor_account_id: actor, state: "PENDING" },
          },
        ],
      };
    }
    return { rows: sql.startsWith("SELECT") ? [{ result: null }] : [] };
  });
  const runtime = createUniversalOriginalSourceRuntime(
    capability(),
    { OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT: "enabled" },
    {
      gateway,
      connection: { withLease: async (work) => work({ query, retire: vi.fn() }) },
    },
  );
  return { runtime, calls, query, gateway };
}
it("starts without a Source Run, Task SQLite or Provider; exact result lookup is a read-only business request", async () => {
  const f = setup();
  try {
    expect(f.calls).toEqual([]);
    expect(
      await f.runtime.universalOriginalSourcePort.lookup(actor, trip, command),
    ).toBeNull();
    expect(f.calls[1]).toContain("trip_source_lookup_universal_original");
    expect(f.calls).not.toContain("trip_source_read_universal_inputs");
  } finally {
    f.runtime.close();
  }
});
it("rejects substituted Source/material and revoked normal Auth without SQL", async () => {
  const f = setup();
  try {
    await expect(
      f.runtime.universalOriginalSourcePort.lookup(actor, trip, {
        ...command,
        source_id: randomUUID(),
      }),
    ).rejects.toThrow("INPUT_PINS");
    expect(f.query).not.toHaveBeenCalled();
    f.gateway.validateAccessToken.mockResolvedValueOnce(null as never);
    await expect(
      f.runtime.universalOriginalSourcePort.acquire(actor, trip, command),
    ).rejects.toThrow("ACCESS_DENIED");
    expect(f.query).not.toHaveBeenCalled();
  } finally {
    f.runtime.close();
  }
});
it("only explicit trusted prepare invokes existing PENDING begin; close blocks both stages", async () => {
  const f = setup();
  expect(await f.runtime.prepareInputs()).toMatchObject({ id: run, state: "PENDING" });
  expect(f.calls[0]).toMatch(/^BEGIN/);
  expect(f.calls.at(-1)).toBe("COMMIT");
  f.runtime.close();
  await expect(f.runtime.prepareInputs()).rejects.toThrow("RUNTIME_CLOSED");
  await expect(
    f.runtime.universalOriginalSourcePort.lookup(actor, trip, command),
  ).rejects.toThrow("RUNTIME_CLOSED");
});
