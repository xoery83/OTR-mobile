import { it, expect } from "vitest";
import { runUniversalContinuationFixture } from "./__fixtures__/universalContinuationRuntime";
it.skipIf(process.platform !== "linux")(
  "recovers retained settled raw after immutable deadline through real SQLite and anchored custody, no Provider",
  async () => {
    const result = await runUniversalContinuationFixture(
      "/custody-tests",
      undefined,
      true,
    );
    expect(result.realProviderCalls).toBe(0);
    expect(result.checks).toHaveLength(4);
  },
);

import { retainedRecoveryManifest } from "./universalSettledRecoveryOperator";
import fixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
import type { Task } from "../../src/domain/intelligence/persistence";
import { randomUUID } from "node:crypto";
function sourceFixture() {
  const raw = structuredClone(fixture);
  const input = raw.trip_source_inputs.find((i) => i.run_id !== null)!;
  const source = raw.trip_sources.find((s) => s.id === input.source_id)!;
  source.current_material_revision = input.material_revision;
  source.row_revision = input.observed_source_row_revision;
  source.acquired_by = raw.actor_account_id;
  const rep = raw.trip_source_representations.find(
    (r) => r.id === input.representation_id,
  )!;
  rep.mime_type = "text/plain" as never;
  const run = raw.trip_source_runs.find((r) => r.id === input.run_id)!;
  const task = {
    account_id: raw.actor_account_id,
    trip_id: raw.trip_id,
    import_id: randomUUID(),
    run_id: run.id,
    expected_run_generation: run.generation,
    input_pins: [
      {
        kind: "SOURCE",
        source_id: input.source_id,
        representation_id: input.representation_id,
        material_revision: input.material_revision,
        payload_sha256: input.payload_sha256,
        byte_count: input.byte_count,
        input_id: input.id,
      },
    ],
  } as Task;
  return { raw: { ...raw, version: 2 }, task, source, rep };
}
it("settled recovery projection uses current owning catalog exact source/input/bytes and rejects deleted/foreign/drift", () => {
  const x = sourceFixture();
  const manifest = retainedRecoveryManifest(x.task, JSON.stringify(x.raw));
  expect(manifest.representations).toHaveLength(1);
  x.source.lifecycle = "DELETED";
  expect(() => retainedRecoveryManifest(x.task, JSON.stringify(x.raw))).toThrow(
    "CURRENT_SOURCE_UNAVAILABLE",
  );
  x.source.lifecycle = "ACTIVE";
  x.source.acquired_by = randomUUID();
  expect(() => retainedRecoveryManifest(x.task, JSON.stringify(x.raw))).toThrow(
    "CURRENT_SOURCE_UNAVAILABLE",
  );
  x.source.acquired_by = x.task.account_id;
  x.rep.text_content += "drift";
  expect(() => retainedRecoveryManifest(x.task, JSON.stringify(x.raw))).toThrow(
    "SOURCE_BYTES",
  );
});
