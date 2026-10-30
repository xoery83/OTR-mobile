import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSourcePdfV2CausalAuthority } from "./sourcePdfCausalAuthority";
import { PDF_UPLOAD_QPDF_V4 } from "../../src/domain/trip/sourcePdfV2Upload";
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID(),
    source = randomUUID(),
    representation = randomUUID();
  const owner = {
    ownerRun: randomUUID(),
    producerId: randomUUID(),
    providerInstanceSha256: "c".repeat(64),
    accountGeneration: vi.fn(async () => 3),
  };
  const binding = {
    uploadVersion: 4,
    operationId: randomUUID(),
    operationKey: "upload-v4",
    operationSha256: "a".repeat(64),
    actorAccountId: actor,
    tripId: trip,
    sourceId: source,
    representationId: representation,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway",
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "b".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${trip}/${source}/${representation}/payload`,
    sha256: "d".repeat(64),
    byteCount: 123,
    mimeType: "application/pdf",
    profileId: PDF_UPLOAD_QPDF_V4.profileId,
    profileSha256: PDF_UPLOAD_QPDF_V4.profileSha256,
    producerId: owner.producerId,
    providerInstanceSha256: owner.providerInstanceSha256,
  };
  const journal = {
    id: binding.attemptId,
    operation_id: binding.operationId,
    phase: "STARTING",
    owner_run: owner.ownerRun,
    owner_fence: 1,
    pdf_binding: binding,
    pdf_dispatch_id: null as string | null,
    pdf_beta_ack: null,
    pdf_beta_get: null,
    staged_resource: { pdf_sealed_at: null as string | null },
  };
  let journals: unknown[] = [journal],
    xid = 0;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("session_user AS principal"))
      return {
        rows: [
          {
            principal: "otr_trip_source_command_gateway",
            role: "otr_trip_source_command_gateway",
            xid: String(++xid),
          },
        ],
      };
    if (sql.includes("pg_current_xact_id")) return { rows: [{ xid: String(++xid) }] };
    if (sql.includes("_inventory(")) return { rows: [{ result: journals }] };
    return { rows: [] };
  });
  const lease = { query, retire: vi.fn() };
  const authority = createSourcePdfV2CausalAuthority(
    { withLease: async (work: (l: typeof lease) => unknown) => work(lease) } as never,
    owner,
    { continuousSourceScope: true },
  );
  const identity = {
    tripId: trip,
    sourceId: source,
    representationId: representation,
    operationId: binding.operationId,
    accountGeneration: 3,
  };
  return {
    actor,
    owner,
    binding,
    journal,
    query,
    authority,
    identity,
    setJournals(v: unknown[]) {
      journals = v;
    },
  };
}
it.each([
  "NO_ACTIVE_ATTEMPT",
  "RESERVED",
  "STAGED",
  "DISPATCH_RECORDED",
  "UNKNOWN",
  "RECOVERY_REQUIRED",
] as const)("projects actual journal %s without issuing a write", async (expected) => {
  const f = fixture();
  if (expected === "NO_ACTIVE_ATTEMPT") f.setJournals([]);
  if (expected === "STAGED")
    f.journal.staged_resource.pdf_sealed_at = "2026-10-30T00:00:00Z";
  if (expected === "DISPATCH_RECORDED") {
    f.journal.phase = "RUNNING";
    f.journal.pdf_dispatch_id = randomUUID();
  }
  if (expected === "UNKNOWN") f.journal.phase = "UNKNOWN";
  if (expected === "RECOVERY_REQUIRED") f.journal.owner_run = randomUUID();
  expect(await f.authority.status(f.actor, f.identity)).toBe(expected);
  const calls = f.query.mock.calls.map(([sql]) => sql);
  expect(calls.filter((sql) => sql.startsWith("SELECT public."))).toEqual([
    expect.stringContaining("_inventory("),
  ]);
  expect(
    calls.some((sql) => /_begin\(|_execute\(|_finish\(|universal_pdf_enter/.test(sql)),
  ).toBe(false);
});
it.each(["actorAccountId", "tripId", "sourceId", "representationId"] as const)(
  "status refuses a journal with substituted %s",
  async (field) => {
    const f = fixture();
    f.binding[field] = randomUUID();
    f.binding.objectKey = `v1/${f.binding.tripId}/${f.binding.sourceId}/${f.binding.representationId}/payload`;
    await expect(f.authority.status(f.actor, f.identity)).rejects.toThrow(
      "PDF_SCOPE_FORBIDDEN",
    );
  },
);
it("status treats changed provider configuration as recovery, never a new reservation", async () => {
  const f = fixture();
  f.binding.providerInstanceSha256 = "e".repeat(64);
  expect(await f.authority.status(f.actor, f.identity)).toBe("RECOVERY_REQUIRED");
});
it("status withholds its projection after a generation transition", async () => {
  const f = fixture();
  f.owner.accountGeneration.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
  await expect(f.authority.status(f.actor, f.identity)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
});
it.each(["ACK_OBSERVED", "READ_OBSERVED"] as const)(
  "projects persisted %s without exposing its evidence",
  async (expected) => {
    const f = fixture(),
      dispatch = randomUUID();
    const common = {
      uploadVersion: 4,
      issuer: PDF_UPLOAD_QPDF_V4.issuer,
      binding: f.binding,
      ownerRun: f.owner.ownerRun,
      ownerFence: 1,
      dispatchId: dispatch,
      observedAt: "2026-10-30T00:00:00.000000Z",
      evidenceSha256: "e".repeat(64),
    };
    const ack = {
      ...common,
      response: {
        status: 200,
        transportComplete: true,
        upsert: false,
        body: "{}",
        bodySha256: "f".repeat(64),
        bodyByteCount: 2,
      },
    };
    const get = {
      ...common,
      read: {
        readId: randomUUID(),
        ackEvidenceSha256: ack.evidenceSha256,
        sha256: f.binding.sha256,
        byteCount: f.binding.byteCount,
        mimeType: "application/pdf",
        cacheBypassed: true,
      },
    };
    f.setJournals([
      {
        ...f.journal,
        phase: "UNKNOWN",
        pdf_dispatch_id: dispatch,
        pdf_beta_ack: ack,
        pdf_beta_get: expected === "READ_OBSERVED" ? get : null,
      },
    ]);
    expect(await f.authority.status(f.actor, f.identity)).toBe(expected);
  },
);
it("does not convert malformed persisted read evidence into observed custody", async () => {
  const f = fixture();
  f.setJournals([{ ...f.journal, pdf_beta_get: { read: { sha256: "wrong" } } }]);
  await expect(f.authority.status(f.actor, f.identity)).rejects.toThrow();
});
