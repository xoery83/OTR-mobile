import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createUniversalBatchSource,
  universalProviderBatchContext,
  universalProviderOwningContext,
  universalBatchIdentity,
} from "./universalBatchSource";
function fixture(finite = false) {
  const actor = randomUUID(),
    trip = randomUUID(),
    batchId = randomUUID();
  const input = {
    batchId,
    submissionSha256: "a".repeat(64),
    inputs: [
      {
        id: randomUUID(),
        source_id: randomUUID(),
        material_revision: 1,
        representation_id: randomUUID(),
        payload_sha256: "b".repeat(64),
        byte_count: 20,
        observed_source_row_revision: 1,
        historical_selection: false as const,
      },
    ],
  };
  let binding: unknown = null;
  const authorize = vi.fn(async () => {}),
    query = vi.fn(async (sql: string) => {
      if (sql.includes("find_sustained") || sql.includes("find_finite"))
        return { rows: [{ binding }] };
      if (sql.includes("begin_sustained") || sql.includes("begin_finite")) {
        binding = {
          actorId: actor,
          tripId: trip,
          ...input,
          runId: universalBatchIdentity(actor, trip, batchId, "run"),
          taskId: universalBatchIdentity(actor, trip, batchId, "task"),
          generation: 1,
          createdAt: new Date().toISOString(),
        };
      }
      return { rows: [] };
    });
  const connection = { withLease: async (work: any) => work({ query, retire: vi.fn() }) };
  const finiteBatch = universalProviderBatchContext(actor, trip, input);
  const source = createUniversalBatchSource({
    connection,
    authorize,
    enabled: true,
    ...(finite ? { finiteBatch } : {}),
  });
  return {
    actor,
    trip,
    input,
    authorize,
    query,
    source,
    connection,
    finiteBatch,
    setBinding: (b: unknown) => {
      binding = b;
    },
  };
}
it("uses only finite owning ports for the frozen server batch and keeps lookup inert", async () => {
  const f = fixture(true);
  expect(await f.source.lookup(f.actor, f.trip, f.input.batchId)).toBeNull();
  const call = f.query.mock.calls.find(([sql]) => sql.includes("find_finite"));
  expect(call).toBeDefined();
  expect(f.query.mock.calls.some(([sql]) => sql.includes("begin_"))).toBe(false);
  const first = await f.source.prepare(f.actor, f.trip, f.input);
  expect(await f.source.prepare(f.actor, f.trip, f.input)).toEqual(first);
  expect(f.query.mock.calls.filter(([sql]) => sql.includes("begin_finite"))).toHaveLength(
    1,
  );
  expect(f.query.mock.calls.some(([sql]) => sql.includes("sustained"))).toBe(false);
});
it("rejects finite actor, trip, batch, digest and source pin changes before owning SQL", async () => {
  const f = fixture(true);
  for (const [actor, trip, input] of [
    [randomUUID(), f.trip, f.input],
    [f.actor, randomUUID(), f.input],
    [f.actor, f.trip, { ...f.input, batchId: randomUUID() }],
    [f.actor, f.trip, { ...f.input, submissionSha256: "c".repeat(64) }],
    [f.actor, f.trip, { ...f.input, inputs: [{ ...f.input.inputs[0], byte_count: 21 }] }],
  ] as const)
    await expect(f.source.prepare(actor, trip, input)).rejects.toThrow("SCOPE");
  expect(f.query).not.toHaveBeenCalled();
  await expect(
    f.source.prepare(f.actor, f.trip, { ...f.input, finite: true }),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("validates finite config identities and owning readback instead of treating either as authority", async () => {
  const f = fixture(true);
  expect(() =>
    createUniversalBatchSource({
      connection: f.connection,
      authorize: f.authorize,
      enabled: true,
      finiteBatch: { ...f.finiteBatch, taskId: randomUUID() },
    }),
  ).toThrow("SCOPE");
  const b = await f.source.prepare(f.actor, f.trip, f.input);
  f.setBinding({ ...b, inputs: [{ ...b.inputs[0], payload_sha256: "c".repeat(64) }] });
  await expect(f.source.lookup(f.actor, f.trip, f.input.batchId)).rejects.toThrow(
    "SCOPE",
  );
});
it("is CLOSED by default before any SQL and read never creates a Run", async () => {
  const f = fixture();
  await expect(
    createUniversalBatchSource({
      connection: f.connection,
      authorize: f.authorize,
    }).lookup(f.actor, f.trip, f.input.batchId),
  ).rejects.toThrow("CLOSED");
  expect(f.query).not.toHaveBeenCalled();
  expect(await f.source.lookup(f.actor, f.trip, f.input.batchId)).toBeNull();
  expect(f.query.mock.calls.some(([q]) => q.includes("begin_sustained"))).toBe(false);
});
it("prepares exactly one owning Run and reuses its readback for duplicate preparation", async () => {
  const f = fixture(),
    first = await f.source.prepare(f.actor, f.trip, f.input);
  expect(first.taskId).not.toBe(first.runId);
  expect(await f.source.prepare(f.actor, f.trip, f.input)).toEqual(first);
  expect(f.query.mock.calls.filter(([q]) => q.includes("begin_sustained"))).toHaveLength(
    1,
  );
  await expect(
    f.source.prepare(f.actor, f.trip, { ...f.input, submissionSha256: "c".repeat(64) }),
  ).rejects.toThrow("REUSED");
});
it("rejects forged current binding and duplicate input pins", async () => {
  const f = fixture(),
    b = await f.source.prepare(f.actor, f.trip, f.input);
  f.setBinding({ ...b, actorId: randomUUID() });
  await expect(f.source.lookup(f.actor, f.trip, f.input.batchId)).rejects.toThrow(
    "SCOPE",
  );
  await expect(
    f.source.prepare(f.actor, f.trip, {
      ...f.input,
      inputs: [...f.input.inputs, ...f.input.inputs],
    }),
  ).rejects.toThrow();
});
it("fences permission revocation after owning readback and keeps identities scoped", async () => {
  const f = fixture();
  f.authorize.mockRejectedValueOnce(Error("DENIED"));
  await expect(f.source.prepare(f.actor, f.trip, f.input)).rejects.toThrow("DENIED");
  expect(f.query).not.toHaveBeenCalled();
  expect(universalBatchIdentity(f.actor, f.trip, f.input.batchId, "task")).not.toBe(
    universalBatchIdentity(randomUUID(), f.trip, f.input.batchId, "task"),
  );
});

it("reuses a sealed PDF Run for the same immutable original without another begin", async () => {
  const f = fixture(),
    original = f.input.inputs[0],
    base = await f.source.prepare(f.actor, f.trip, f.input),
    pdfSource = {
      original: {
        representationId: original.representation_id,
        sha256: original.payload_sha256,
        byteCount: original.byte_count,
      },
      sealSha256: "d".repeat(64),
      pageMapSha256: "e".repeat(64),
      transformOptionsSha256: PDF_V2_OPTIONS_SHA,
    },
    derived = {
      ...base,
      inputs: [
        {
          ...original,
          representation_id: randomUUID(),
          payload_sha256: "f".repeat(64),
          byte_count: 50,
          pdfSource,
        },
      ],
    };
  const selected = universalProviderOwningContext(derived);
  expect(selected.inputs).toEqual(f.input.inputs);
  expect(selected.owningBinding.inputs[0]).toEqual(derived.inputs[0]);
  expect(selected.owningBinding.inputs[0].representation_id).not.toBe(
    selected.inputs[0].representation_id,
  );
  f.setBinding(derived);
  expect(await f.source.prepare(f.actor, f.trip, f.input)).toEqual(derived);
  expect(f.query.mock.calls.filter(([q]) => q.includes("begin_sustained"))).toHaveLength(
    1,
  );
  for (const changed of [
    { ...original, representation_id: randomUUID() },
    { ...original, payload_sha256: "c".repeat(64) },
    { ...original, byte_count: original.byte_count + 1 },
  ]) {
    await expect(
      f.source.prepare(f.actor, f.trip, { ...f.input, inputs: [changed] }),
    ).rejects.toThrow("REUSED");
  }
  await expect(
    f.source.prepare(f.actor, f.trip, {
      ...f.input,
      inputs: [{ ...original, pdfSource }],
    }),
  ).rejects.toThrow();
});

it("rejects malformed owning PDF normalization before reuse", async () => {
  const f = fixture(),
    base = await f.source.prepare(f.actor, f.trip, f.input),
    original = base.inputs[0];
  const proof = {
    original: {
      representationId: original.representation_id,
      sha256: original.payload_sha256,
      byteCount: original.byte_count,
    },
    sealSha256: "d".repeat(64),
    pageMapSha256: "e".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  for (const bad of [
    { ...original, pdfSource: proof },
    {
      ...original,
      representation_id: randomUUID(),
      byte_count: 262145,
      pdfSource: proof,
    },
    {
      ...original,
      representation_id: randomUUID(),
      pdfSource: { ...proof, transformOptionsSha256: "f".repeat(64) },
    },
  ]) {
    f.setBinding({ ...base, inputs: [bad] });
    await expect(f.source.lookup(f.actor, f.trip, f.input.batchId)).rejects.toThrow();
  }
});

it("passes validated exact batch context with deterministic identities to provider selection", () => {
  const q = fixture();
  const context = universalProviderBatchContext(q.actor, q.trip, q.input);
  expect(context.runId).toBe(
    universalBatchIdentity(q.actor, q.trip, q.input.batchId, "run"),
  );
  expect(context.taskId).toBe(
    universalBatchIdentity(q.actor, q.trip, q.input.batchId, "task"),
  );
  expect(context.inputs).toEqual(q.input.inputs);
  expect(context.submissionSha256).toBe(q.input.submissionSha256);
  expect(() =>
    universalProviderBatchContext(q.actor, q.trip, { ...q.input, finite: true }),
  ).toThrow();
  expect(() =>
    universalProviderBatchContext(q.actor, q.trip, {
      ...q.input,
      submissionSha256: "bad",
    }),
  ).toThrow();
  const owning = { ...context, generation: 1, createdAt: new Date().toISOString() };
  expect(universalProviderOwningContext(owning).owningBinding).toEqual(owning);
  expect(() =>
    universalProviderOwningContext({ ...owning, runId: randomUUID() }),
  ).toThrow("UNIVERSAL_BINDING_SCOPE");
  expect(() =>
    universalProviderOwningContext({ ...owning, taskId: randomUUID() }),
  ).toThrow("UNIVERSAL_BINDING_SCOPE");
});
