import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { captureAccountRequestContext } from "../../../src/data/auth/accountRequestContext";
import { universalResultSchema } from "../../../src/data/api/universalImportContracts";
import { projectUniversalP2SourceProposal } from "../universalP2SourceReview";

// Retained synthetic result; the catalog digest and publication decision are unit-fixture inputs.
export async function universalP2SourceFixture(freshIdentity = false) {
  const packet = new URL(
    "../../../docs/ops/universal-p2-formal-save-20261027/",
    import.meta.url,
  );
  let result = universalResultSchema.parse(
    JSON.parse(readFileSync(new URL("P2_BATCH9_SETTLED_RESULTS.json", packet), "utf8"))
      .results,
  );
  const owning = JSON.parse(
    readFileSync(new URL("P2_BATCH9_OWNING_TASK_RECEIPT.json", packet), "utf8"),
  );
  if (freshIdentity) {
    const previous = result.sourceBindings[0];
    let wire = JSON.stringify(result);
    for (const id of [
      result.batchId,
      result.taskId,
      previous.inputId,
      previous.sourceId,
      previous.representationId,
    ])
      wire = wire.replaceAll(id, randomUUID());
    result = universalResultSchema.parse(JSON.parse(wire));
  }
  const b = result.sourceBindings[0];
  const deps = {
    hash: async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
    getAccountId: async () => result.accountId,
  };
  const context = await captureAccountRequestContext(result.tripId, deps.getAccountId);
  const sourceReview = {
    version: "otr.universal.p2-source-review/1" as const,
    decision: "NEW" as const,
    sourceRevision: b.revision,
    flightNumberLiteral: "NZ501",
    departureDate: "2026-11-02",
    originalReviewed: true as const,
    tripReviewed: true as const,
  };
  const resultSha256 = freshIdentity
    ? await deps.hash(Buffer.from(JSON.stringify(result)))
    : owning.task.result_sha256;
  const input = {
    context,
    result,
    resultSha256,
    selection: { token: "i1", resultSha256, sourceReview },
    runId: freshIdentity ? randomUUID() : "8af82103-55f2-84ea-8e6f-445a15321cf6",
    inputCatalogSha256: "a".repeat(64),
    material: {
      pin: {
        id: b.inputId,
        source_id: b.sourceId,
        material_revision: b.revision,
        representation_id: b.representationId,
        payload_sha256: b.originalSha256,
        byte_count: 27,
        observed_source_row_revision: 1,
        historical_selection: false,
      },
      media_type: "text/plain" as const,
      form: "TEXT" as const,
      text: "NZ501 AKL→CHC 2026-11-02\n",
    },
  };
  const proposal = await projectUniversalP2SourceProposal(input, deps);
  return {
    input,
    deps,
    proposal,
    run: async () => ({ body: { plan: proposal.plan }, candidateSha256: "c".repeat(64) }),
  };
}
