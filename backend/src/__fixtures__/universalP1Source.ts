import { fieldRef } from "../../../src/domain/trip/tripCoreV2CandidatePublication";
import { createHash, randomUUID } from "node:crypto";
import { captureAccountRequestContext } from "../../../src/data/auth/accountRequestContext";
import { tripImportCatalogSchemas } from "../../../src/data/api/tripImportCatalogContracts";
import { importLifecycleSnapshotSchema } from "../../../src/data/operations/importLifecycleProposal";
import { emptyCoreGraph } from "../../../src/domain/trip/tripCoreV2Mutation";
import {
  prepareUniversalDispatch,
  projectUniversalResponse,
  UNIVERSAL_IMPORT_VERSION,
} from "../universalImport";
import { qualifyUniversalP1Selection, universalP1Identity } from "../universalP1Source";
import type { CoreSourceCatalogV2 } from "../tripCoreV2Source";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function universalP1SourceFixture(
  accountId: string = randomUUID(),
  tripId: string = randomUUID(),
  dateRaw = "2026-11-03",
) {
  const batchId = randomUUID(),
    taskId = randomUUID(),
    sourceId = randomUUID(),
    inputId = randomUUID(),
    representationId = randomUUID(),
    runId = randomUUID();
  const text = `Synthetic QA only\nActivity: 海滨散步\nActivity date: ${dateRaw}\nMeeting place: West gate\n`;
  const bytes = Buffer.from(text),
    sha256 = await hash(bytes),
    stamp = "2026-10-25T00:00:00.000000Z";
  const context = await captureAccountRequestContext(tripId, async () => accountId);
  const source = {
    id: sourceId,
    trip_id: tripId,
    acquired_by: accountId,
    acquisition_key: "synthetic",
    acquisition_sha256: sha256,
    source_kind: "TEXT",
    acquisition_channel: "TEXT",
    captured_at: null,
    capture_time_basis: "UNKNOWN",
    created_at: stamp,
    access_mode: "OWNER_PRIVATE",
    lifecycle: "ACTIVE",
    current_material_revision: 1,
    row_revision: 1,
    retention_state: "RETAINED",
    deleted_at: null,
    deleted_by: null,
  };
  const representation = tripImportCatalogSchemas.trip_source_representations.parse({
    ...Object.fromEntries(
      Object.keys(tripImportCatalogSchemas.trip_source_representations.shape).map((k) => [
        k,
        null,
      ]),
    ),
    id: representationId,
    row_revision: 1,
    source_id: sourceId,
    introduced_revision: 1,
    role: "ORIGINAL",
    material_kind: "TEXT",
    payload_sha256: sha256,
    byte_count: bytes.length,
    text_content: text,
    parent_ids: [],
    regenerability: "NOT_APPLICABLE",
    created_at: stamp,
    remote_state: "NOT_APPLICABLE",
    retention_state: "RETAINED",
  });
  const pin = {
    id: inputId,
    source_id: sourceId,
    material_revision: 1,
    representation_id: representationId,
    payload_sha256: sha256,
    byte_count: bytes.length,
    observed_source_row_revision: 1,
    historical_selection: false,
  };
  const snapshot = importLifecycleSnapshotSchema.parse({
    sources: [source],
    representations: [representation],
    associations: [],
    materials: [{ pin, media_type: "text/plain", form: "TEXT", text }],
  });
  const dispatch = prepareUniversalDispatch(
    accountId,
    batchId,
    { version: UNIVERSAL_IMPORT_VERSION, tripId, taskId },
    {
      accountId,
      tripId,
      batchId,
      representations: [
        {
          accountId,
          tripId,
          batchId,
          inputId,
          sourceId,
          representationId,
          revision: 1,
          originalSha256: sha256,
          mime: "text/plain",
          bytes,
        },
      ],
    },
  );
  const result = projectUniversalResponse(dispatch, {
    output: {
      v: 2,
      items: [
        {
          id: "walk",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [
            [0, "activity.name", "海滨散步"],
            [0, "activity.date", dateRaw],
          ],
        },
      ],
      bookings: [],
      tickets: [],
      links: [],
      issues: [],
    },
    providerReceipt: { outcome: "SETTLED", requestId: "synthetic-receipt" },
  });
  const catalog: CoreSourceCatalogV2 = {
    actorAccountId: accountId,
    tripId,
    sourceId,
    sourceRevision: 1,
    inputCatalogSha256: "a".repeat(64),
    source: snapshot.sources[0],
    inputs: [pin],
    candidates: [],
  };
  const input = {
    context,
    actor: {
      accountId,
      tripId,
      active: true,
      personId: null,
      personIds: [],
      canManageShared: false,
    },
    graph: emptyCoreGraph(),
    snapshot,
    catalog,
    runId,
    result,
    resultSha256: "b".repeat(64),
    selection: { action: "CONFIRM_NEW_P1", token: "walk", resultSha256: "b".repeat(64) },
    // Explicit synthetic owning-relationship assumption; not a real runtime issuer.
    owningLifecycleRelationships: [
      {
        id: "owning-fixture:new",
        kind: "NEW" as const,
        candidateIds: [universalP1Identity(result.taskId, "walk", "candidate")],
        evidenceRefs: [
          fieldRef(
            universalP1Identity(result.taskId, "walk", "candidate"),
            "ROOT.title.0",
          ),
          fieldRef(
            universalP1Identity(result.taskId, "walk", "candidate"),
            "START.local_date.0",
          ),
        ],
      },
    ],
  };
  const deps = { hash, getAccountId: async () => accountId };
  return { input, deps, run: () => qualifyUniversalP1Selection(input, deps) };
}
