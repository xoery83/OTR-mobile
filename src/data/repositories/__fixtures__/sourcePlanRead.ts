import { coreSourcePlanReadV2Schema } from "@/domain/trip/tripCoreV2SourceContract";
import { randomUUID } from "node:crypto";
export function sourcePlanReadFixture(actor: string, trip: string) {
  const planId = randomUUID(),
    sourceId = randomUUID(),
    candidateId = randomUUID(),
    slotId = randomUUID(),
    operationId = randomUUID(),
    itemId = randomUUID();
  const fields = ["ROOT.title", "START.local_date"],
    refs = Object.fromEntries(
      fields.map((f) => [f, [`track-c/field-evidence/${candidateId}/${f}.0`]]),
    );
  const slot = {
    slotId,
    slotKey: "i1",
    adapterKey: "otr.trip.core/2",
    candidateId,
    targetKind: "ITEM",
    target: { kind: "ITEM", candidateSlotId: null, existingId: itemId },
    command: "CREATE_ITEM",
    operationId,
    intentSha256: "a".repeat(64),
    dependsOn: [],
    selectedFields: fields,
    evidenceRefs: refs,
    baseVector: null,
    state: "COMPLETE",
    outputPurpose: {
      version: 2,
      accountId: actor,
      tripId: trip,
      sourceId,
      sourceRevision: 1,
      runId: randomUUID(),
      candidateId,
      inputCatalogSha256: "b".repeat(64),
      candidateSha256: "c".repeat(64),
      planId,
      slotId,
      targetKind: "ITEM",
      targetId: itemId,
      operationId,
      purposeKind: "P1_ITEM",
      payloadSha256: "d".repeat(64),
      selectedFields: fields,
      evidenceRefs: refs,
      purposeSha256: "e".repeat(64),
    },
  };
  return coreSourcePlanReadV2Schema.parse({
    captureVersion: 2,
    plan: {
      proposalVersion: 2,
      intentVersion: 2,
      planId,
      accountId: actor,
      tripId: trip,
      sourceId,
      sourceRevision: 1,
      candidateIds: [candidateId],
      mode: "REVIEWED_SOURCE",
      policyVersion: null,
      slots: [slot],
    },
    status: {
      planId,
      status: "COMPLETE",
      slots: [
        {
          slotId,
          operationId,
          targetKind: "ITEM",
          targetId: itemId,
          outcome: "COMPLETE",
          errorCode: null,
          domainReceiptId: randomUUID(),
          committedRevision: 1,
        },
      ],
      reviewCount: 0,
    },
  });
}
