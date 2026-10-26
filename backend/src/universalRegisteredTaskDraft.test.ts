import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { buildUniversalRegisteredTaskDraft } from "./universalRegisteredTaskDraft";
function fixture(n = 1) {
  const actorId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID();
  const representations = Array.from({ length: n }, (_, i) => {
    const bytes = Buffer.from(`Synthetic ${i} 中文行程`);
    return {
      accountId: actorId,
      tripId,
      batchId,
      inputId: randomUUID(),
      sourceId: randomUUID(),
      representationId: randomUUID(),
      revision: 1,
      originalSha256: createHash("sha256").update(bytes).digest("hex"),
      mime: "text/plain",
      bytes,
    };
  }).sort((a, b) => a.inputId.localeCompare(b.inputId));
  const binding = {
    actorId,
    tripId,
    batchId,
    runId: randomUUID(),
    taskId: randomUUID(),
    submissionSha256: "a".repeat(64),
    generation: 2,
    createdAt: new Date().toISOString(),
    inputs: representations.map((r) => ({
      id: r.inputId,
      source_id: r.sourceId,
      material_revision: 1,
      representation_id: r.representationId,
      payload_sha256: r.originalSha256,
      byte_count: r.bytes.length,
      observed_source_row_revision: 1,
      historical_selection: false as const,
    })),
  };
  const selection = {
    integrationId: "synthetic",
    configVersion: 2,
    configurationSha256: "c".repeat(64),
    providerConfigId: randomUUID(),
    priceScheduleId: randomUUID(),
    providerId: "DeepSeek" as const,
    modelId: "deepseek-flash" as const,
    modelVersion: "DeepSeek-V4.1-Flash" as const,
    adapterVersion: "synthetic",
    region: "synthetic",
    route: "synthetic",
    maxCostNanos: "1000000000",
    taskLifetimeMs: 600000,
  };
  return {
    binding,
    manifest: { accountId: actorId, tripId, batchId, representations },
    selection,
  };
}
it.each([1, 3, 6])(
  "constructs deterministic %s-Source normal Task using actual Run identities without finite QA assumptions",
  async (n) => {
    const f = fixture(n),
      a = await buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
      b = await buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection);
    expect(a).toEqual(b);
    expect(a.task.input_pins).toHaveLength(n);
    expect(a.task.run_id).toBe(f.binding.runId);
    expect(a.task.expected_run_generation).toBe(2);
    expect(a.task.sync_operation_id).toBeNull();
    expect(a.attempt.attempt_sequence).toBe(1);
    expect(a.task.policy_snapshot.deadline).toBe(
      new Date(Date.parse(f.binding.createdAt) + 600000).toISOString(),
    );
  },
);
it("rejects changed Source/representation bytes before creating Task or Provider work", async () => {
  const f = fixture();
  f.manifest.representations[0].bytes = Buffer.from("changed");
  await expect(
    buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
  ).rejects.toThrow("SOURCE_BINDING");
});
it('accepts owning PostgreSQL offset timestamps without losing fractional evidence or changing Task identity', async () => {
  const f=fixture(2);
  f.binding.createdAt='2026-10-25T08:55:01.123456Z';
  const expected=await buildUniversalRegisteredTaskDraft(f.binding,f.manifest,f.selection);
  for(const stamp of ['2026-10-25T08:55:01.123456+00:00','2026-10-25T21:55:01.123456+13:00']) {
    const actual=await buildUniversalRegisteredTaskDraft({...f.binding,createdAt:stamp},f.manifest,f.selection);
    expect(actual).toEqual(expected);
    expect(actual.task.created_at).toBe('2026-10-25T08:55:01.123456Z');
    expect(actual.attempt.updated_at).toBe(actual.task.created_at);
  }
});
