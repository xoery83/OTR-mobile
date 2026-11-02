import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { CoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import {
  readAcceptedUniversalAuditCatalog,
  readUniversalP1Catalog,
} from "./universalP1SourcePg";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
const owning = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./tripCoreV2SourcePgStorage", async (original) => ({
  ...(await original<typeof import("./tripCoreV2SourcePgStorage")>()),
  readOwningLegacySourceCatalog: owning.read,
}));
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const f = await universalP1SourceFixture(),
    checked = await f.run(),
    body = structuredClone(checked.body) as any;
  const { catalog, result } = f.input,
    pin = catalog.inputs[0] as any;
  Object.assign(catalog.source as Record<string, unknown>, {
    source_kind: "IMAGE",
    lifecycle: "ACTIVE",
    retention_state: "RETAINED",
    current_material_revision: 1,
    row_revision: pin.observed_source_row_revision,
  });
  result.sourceBindings[0].mime = "image/png";
  body.schemaId = "otr.core.universal-p1-source/2";
  body.sourceReview = {
    version: "otr.universal.p1-source-review/1",
    decision: "NEW",
    sourceRevision: 1,
    title: "Synthetic historical item",
    localDate: "2026-11-03",
    originalReviewed: true,
    tripReviewed: true,
  };
  body.reviewedBy = catalog.actorAccountId;
  const candidateSHA = await coreHashValue(
    "otr-trip-core-source-candidate-v2",
    body,
    hash,
  );
  const operation = randomUUID(),
    domain = randomUUID(),
    target = randomUUID();
  const receipt = {
    actorAccountId: catalog.actorAccountId,
    tripId: catalog.tripId,
    operationId: operation,
    receiptSha256: "c".repeat(64),
    intentSha256: "d".repeat(64),
    command: "CREATE_ITEM",
    outcome: "APPLIED",
    targetVector: [{ kind: "ITEM", id: target, committedRevision: 1 }],
    audit: {
      before: [],
      after: [],
      evidenceRefs: Object.values(body.fieldEvidence).map((e: any) => e.ref),
      authorizationRefs: [
        `otr-core/source-candidate/${body.candidateId}/${candidateSHA}`,
      ],
    },
  } as unknown as CoreReceipt;
  const slot = {
    account_id: catalog.actorAccountId,
    trip_id: catalog.tripId,
    source_id: catalog.sourceId,
    candidate_id: body.candidateId,
    state: "COMPLETE",
    operation_id: operation,
    command: "CREATE_ITEM",
    target_kind: "ITEM",
    target_id: target,
    domain_receipt_id: domain,
    intent_sha256: receipt.intentSha256,
    plan_id: body.plan.planId,
  };
  const row: any = {
    account_id: catalog.actorAccountId,
    trip_id: catalog.tripId,
    candidate_id: body.candidateId,
    candidate_json: body,
    candidate_sha256: candidateSHA,
    run_id: body.runId,
    source_revision: body.sourceRevision,
    input_catalog_sha256: catalog.inputCatalogSha256,
    source_id: catalog.sourceId,
    retained_slot: slot,
    retained_outcome: receipt.outcome,
    retained_receipt_id: domain,
    retained_receipt_body: structuredClone(receipt),
    retained_receipt_sha256: receipt.receiptSha256,
    retained_intent_sha256: receipt.intentSha256,
  };
  const proof = {
    actorAccountId: catalog.actorAccountId,
    tripId: catalog.tripId,
    sourceId: catalog.sourceId,
    representationId: pin.representation_id,
    sourceRevision: 1,
    sourceRowRevision: pin.observed_source_row_revision,
    sha256: pin.payload_sha256,
    byteCount: pin.byte_count,
    verification: {
      attemptId: randomUUID(),
      operationId: randomUUID(),
      terminalEvidenceSha256: "e".repeat(64),
      profileId: "PNG_STATIC_RGB8_RGBA8_V1",
      profileSha256: "0e22d87a595129dbd9a3b2b00a771379f0e26d15d7a46781c76c7c08ed65a726",
    },
  };
  const representation = {
    ...f.input.snapshot.representations[0],
    material_kind: "BINARY",
    encoding: null,
    mime_type: "image/png",
    text_content: null,
    remote_state: "VERIFIED",
    verified_at: "2026-11-01T00:00:00.000000Z",
  };
  let denied = false;
  const raw = vi.fn(async () => {
    throw Error("SOURCE_CAPABILITY_CLOSED");
  });
  const read = vi.fn(async (_scope: unknown, lease: unknown) => {
    expect(lease).toBe(connection);
    if (denied) throw Error("SOURCE_ACCESS_DENIED");
    return {
      result,
      resultSha256: body.resultSha256,
      runId: body.runId,
      taskRowRevision: 3,
      publicationFence: 1,
      readBinary: raw,
    };
  });
  const connection = {
    retire: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql === "SELECT current_user AS role")
        return { rows: [{ role: "otr_trip_core_v2_writer" }] };
      if (sql.includes("AS retained_slot")) return { rows: [row] };
      if (sql.includes("SELECT * FROM public.trip_source_core_v2_candidates"))
        return { rows: [row] };
      if (sql.includes(" AS representations"))
        return {
          rows: [
            {
              representations: [representation],
              associations: [],
              source: catalog.source,
            },
          ],
        };
      if (sql.includes("trip_source_read_sustained_png_proof"))
        return { rows: [{ proof }] };
      if (sql.startsWith("SELECT c.candidate_json")) return { rows: [row] };
      if (sql.startsWith("SELECT rep.id FROM"))
        return { rows: [{ id: pin.representation_id }] };
      if (sql.startsWith("SELECT source_id FROM"))
        return { rows: [{ source_id: catalog.sourceId }] };
      throw Error("UNEXPECTED_TEST_QUERY");
    }),
  };
  owning.read.mockImplementation(async (lease: unknown) => {
    expect(lease).toBe(connection);
    if (denied) throw Error("SOURCE_ACCESS_DENIED");
    return structuredClone(catalog);
  });
  const scope = {
    actorAccountId: catalog.actorAccountId,
    tripId: catalog.tripId,
    sourceId: catalog.sourceId,
    planId: operation,
  };
  return {
    scope,
    receipt,
    row,
    slot,
    catalog,
    body,
    pin,
    result,
    read,
    raw,
    connection,
    deny: () => {
      denied = true;
    },
    run: () =>
      readAcceptedUniversalAuditCatalog(
        connection,
        scope,
        body.candidateId,
        receipt,
        hash,
        read,
      ),
  };
}
it.each(["APPLIED", "NO_CHANGE"] as const)(
  "reads the exact completed %s audit via metadata while ordinary catalog/Admission still requires raw material",
  async (outcome) => {
    const f = await fixture();
    f.receipt.outcome = outcome;
    f.row.retained_outcome = outcome;
    f.row.retained_receipt_body = structuredClone(f.receipt);
    await expect(
      readUniversalP1Catalog(f.connection, f.scope, [f.body.candidateId], hash, f.read),
    ).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
    const before = f.raw.mock.calls.length;
    expect((await f.run()).candidates[0].candidateSha256).toBe(f.row.candidate_sha256);
    expect(f.raw).toHaveBeenCalledTimes(before);
    const authority = createCoreSourcePgAuthority(
      {
        withLease: async () => {
          throw Error("SECOND_CONNECTION_FORBIDDEN");
        },
      },
      hash,
      { readUniversalP1: f.read },
    );
    expect(
      await authority.canReadAudit(
        f.connection,
        {
          accountId: f.scope.actorAccountId,
          tripId: f.scope.tripId,
          active: true,
          personId: null,
          personIds: [],
          canManageShared: false,
        },
        f.receipt,
      ),
    ).toBe(true);
    await expect(
      readUniversalP1Catalog(f.connection, f.scope, [f.body.candidateId], hash, f.read),
    ).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
    expect(
      f.connection.query.mock.calls.every(
        ([sql]) => !/^INSERT|^UPDATE|^DELETE|^BEGIN|^COMMIT/.test(sql),
      ),
    ).toBe(true);
  },
);
it.each([
  "incomplete",
  "wrong-receipt",
  "wrong-source",
  "wrong-target",
  "wrong-domain",
  "wrong-outcome",
  "body-hash",
  "unpin",
  "revision",
  "lifecycle",
  "revoked",
  "run-retention",
  "fence",
] as const)("refuses historical audit with %s", async (failure) => {
  const f = await fixture();
  if (failure === "incomplete") f.slot.state = "EVIDENCE_PENDING";
  if (failure === "wrong-receipt") f.receipt.operationId = randomUUID();
  if (failure === "wrong-source") f.slot.source_id = randomUUID();
  if (failure === "wrong-target") f.slot.target_id = randomUUID();
  if (failure === "wrong-domain") f.slot.domain_receipt_id = randomUUID();
  if (failure === "wrong-outcome") f.row.retained_outcome = "REJECTED";
  if (failure === "body-hash") {
    f.body.plan.planId = randomUUID();
    f.row.candidate_sha256 = await coreHashValue(
      "otr-trip-core-source-candidate-v2",
      f.body,
      hash,
    );
  }
  if (failure === "unpin") f.receipt.audit.authorizationRefs = [];
  if (failure === "revision") f.catalog.sourceRevision++;
  if (failure === "lifecycle") (f.catalog.source as any).lifecycle = "DELETED";
  if (failure === "revoked") f.deny();
  if (failure === "run-retention") owning.read.mockRejectedValue(Error("INPUT_STALE"));
  if (failure === "fence") {
    const read = f.read.getMockImplementation()!;
    let count = 0;
    f.read.mockImplementation(async (...args) => ({
      ...(await read(...args)),
      publicationFence: ++count === 1 ? 1 : 2,
    }));
  }
  await expect(f.run()).rejects.toThrow();
  expect(f.raw).not.toHaveBeenCalled();
});
