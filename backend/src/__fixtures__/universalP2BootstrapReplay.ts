import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { buildUniversalRegisteredTaskDraft } from "../universalRegisteredTaskDraft";
import {
  bootstrapUniversalTask,
  initializeUniversalTaskDatabase,
} from "../universalTaskBootstrap";
import { ledgerBootstrapResponseSchema } from "../../../src/data/api/ledgerReadContracts";
import { universalRunBindingSchema } from "../universalBatchSource";

const packet = JSON.parse(readFileSync(process.argv[2], "utf8"));
const r = packet.run,
  catalog = packet.catalog;
const inputs = catalog.trip_source_inputs
  .filter((p: any) => p.run_id === r.id)
  .map(({ run_id: _run, confirmation_id: _confirmation, ...pin }: any) => pin);
const binding = universalRunBindingSchema.parse({
  actorId: r.actor_account_id,
  tripId: r.trip_id,
  batchId: r.capture_batch_id,
  submissionSha256: r.capture_submission_sha256,
  runId: r.id,
  taskId: r.interpretation_task_id,
  generation: r.generation,
  createdAt: r.created_at,
  inputs,
});
const manifest = {
  accountId: binding.actorId,
  tripId: binding.tripId,
  batchId: binding.batchId,
  representations: inputs.map((p: any) => {
    const rep = catalog.trip_source_representations.find(
      (x: any) => x.id === p.representation_id,
    );
    return {
      accountId: binding.actorId,
      tripId: binding.tripId,
      batchId: binding.batchId,
      inputId: p.id,
      sourceId: p.source_id,
      representationId: p.representation_id,
      revision: p.material_revision,
      originalSha256: p.payload_sha256,
      mime: "text/plain",
      bytes: Buffer.from(rep.text_content),
    };
  }),
};
const selection = {
  integrationId: "synthetic",
  configVersion: 2,
  configurationSha256: "c".repeat(64),
  providerConfigId: "08e8113c-41dd-47cf-8d90-fc9eba98162e",
  priceScheduleId: "56f9eee5-bee5-4ace-820d-c3a8d472ef04",
  providerId: "DeepSeek" as const,
  modelId: "deepseek-flash" as const,
  modelVersion: "DeepSeek-V4.1-Flash" as const,
  adapterVersion: "otr-universal-deepseek-v1",
  region: "synthetic",
  route: "synthetic",
  maxCostNanos: "50000000",
  taskLifetimeMs: 600000,
};
const draft = await buildUniversalRegisteredTaskDraft(binding, manifest, selection);
const sql = new DatabaseSync(":memory:");
// Isolated replay preserves the original deadline; never changes DEV objects.
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(value?: string) {
    super(value ?? "2026-10-26T19:09:00Z");
  }
  static now() {
    return new RealDate("2026-10-26T19:09:00Z").getTime();
  }
} as DateConstructor;
try {
  const db = initializeUniversalTaskDatabase(sql);
  await bootstrapUniversalTask({
    db,
    task: draft.task,
    attempt: draft.attempt,
    catalog: JSON.stringify(catalog),
    ledger: ledgerBootstrapResponseSchema.parse(packet.ledger),
    getAccountId: async () => binding.actorId,
    assertCurrent: () => {},
    claimQueue: false,
  });
  assert.equal(
    sql
      .prepare(
        "SELECT task_id FROM intelligence_continuations WHERE account_id=? AND task_id=?",
      )
      .all(binding.actorId, binding.taskId).length,
    1,
  );
} finally {
  globalThis.Date = RealDate;
  sql.close();
}
