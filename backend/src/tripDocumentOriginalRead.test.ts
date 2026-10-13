import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreTableSchemas } from "../../src/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "../../src/domain/trip/tripCoreV2Mutation";
import {
  createTripDocumentOriginalRead,
  type OriginalReadPorts,
  type RetainedOriginal,
} from "./tripDocumentOriginalRead";

const unavailable = { status: "UNAVAILABLE" };
function fixture(custody: RetainedOriginal["custody"] = "AUTHORIZED_COPY") {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const documentId = randomUUID();
  const custodyReceiptId = randomUUID();
  const graph = emptyCoreGraph();
  graph.trip_operational_documents.push({
    ...Object.fromEntries(
      Object.keys(coreTableSchemas.trip_operational_documents.shape).map((key) => [
        key,
        null,
      ]),
    ),
    id: documentId,
    trip_id: actor.tripId,
    revision: 1,
    owner_account_id: actor.accountId,
    visibility: "PRIVATE",
    hidden_at: null,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    field_state: {},
    title: "Synthetic original",
    media_type: "application/pdf",
    byte_size: bytes.byteLength,
    sha256,
    custody,
    source_representation_id:
      custody === "PRIVATE_SOURCE_REFERENCE" ? randomUUID() : null,
    storage_object_key: custody === "AUTHORIZED_COPY" ? "private/internal/key" : null,
    content_version: 1,
    custody_receipt_id: custodyReceiptId,
  });
  const request = {
    actorAccountId: actor.accountId,
    tripId: actor.tripId,
    documentId,
    contentVersion: 1,
    sha256,
  };
  const retained: RetainedOriginal = {
    ...request,
    custodyReceiptId,
    byteSize: bytes.byteLength,
    custody,
    state: "BOUND",
    right: custody === "AUTHORIZED_COPY" ? "CURRENT_COPY_GRANT" : "CURRENT_SOURCE_RIGHT",
    generation: "custody-generation-1",
  };
  const ports: OriginalReadPorts = {
    currentAccess: vi.fn(async () => ({ actor, graph, accessRevision: 1 })),
    readRetained: vi.fn(async () => ({ ...retained, bytes })),
    currentRetention: vi.fn(async () => retained),
  };
  return { actor, graph, request, retained, bytes, ports };
}

it("reads only a current ACL-authorized, custody-bound exact original without exposing locator", async () => {
  const f = fixture();
  const result = await createTripDocumentOriginalRead(f.ports).read(
    f.actor.accountId,
    f.request,
  );
  expect(result).toMatchObject({
    status: "AVAILABLE",
    documentId: f.request.documentId,
    contentVersion: 1,
    sha256: f.request.sha256,
    byteSize: f.bytes.byteLength,
  });
  if (result.status !== "AVAILABLE") throw new Error("original unavailable");
  expect(result.bytes).toEqual(f.bytes);
  expect(result.bytes).not.toBe(f.bytes);
  expect(JSON.stringify(result)).not.toContain("private/internal/key");
  const providerScope = vi.mocked(f.ports.readRetained).mock.calls[0][0];
  expect(providerScope).not.toHaveProperty("storage_object_key");
  expect(JSON.stringify(providerScope)).not.toContain("private/internal/key");
});

it("allows a Source reference only with a current Source right and retained bytes", async () => {
  const f = fixture("PRIVATE_SOURCE_REFERENCE");
  const result = await createTripDocumentOriginalRead(f.ports).read(
    f.actor.accountId,
    f.request,
  );
  expect(result.status).toBe("AVAILABLE");
  expect(f.ports.readRetained).toHaveBeenCalledOnce();
  expect(f.ports.currentRetention).toHaveBeenCalledTimes(2);
});

it("fails closed when no current ACL or real custody ports are installed", async () => {
  const f = fixture();
  expect(
    await createTripDocumentOriginalRead().read(f.actor.accountId, f.request),
  ).toEqual(unavailable);
  const other = randomUUID();
  expect(
    await createTripDocumentOriginalRead(f.ports).read(f.actor.accountId, {
      ...f.request,
      actorAccountId: other,
    }),
  ).toEqual(unavailable);
  const denied = {
    ...f.ports,
    currentAccess: vi.fn(async () => ({
      actor: { ...f.actor, accountId: other },
      graph: f.graph,
      accessRevision: 1,
    })),
  };
  expect(
    await createTripDocumentOriginalRead(denied).read(other, {
      ...f.request,
      actorAccountId: other,
    }),
  ).toEqual(unavailable);
  expect(denied.readRetained).not.toHaveBeenCalled();
  expect(
    await createTripDocumentOriginalRead({
      ...f.ports,
      currentRetention: undefined,
    }).read(f.actor.accountId, f.request),
  ).toEqual(unavailable);
});

it("rejects stale version or hash before custody and limits text originals to 1 MiB", async () => {
  const f = fixture();
  const read = createTripDocumentOriginalRead(f.ports);
  expect(await read.read(f.actor.accountId, { ...f.request, contentVersion: 2 })).toEqual(
    unavailable,
  );
  expect(
    await read.read(f.actor.accountId, { ...f.request, sha256: "0".repeat(64) }),
  ).toEqual(unavailable);
  f.graph.trip_operational_documents[0].media_type = "text/plain";
  f.graph.trip_operational_documents[0].byte_size = 1024 * 1024 + 1;
  expect(await read.read(f.actor.accountId, f.request)).toEqual(unavailable);
  expect(f.ports.readRetained).not.toHaveBeenCalled();
});

it("rejects an inconsistent copy locator or Source reference before reading bytes", async () => {
  const copy = fixture();
  copy.graph.trip_operational_documents[0].storage_object_key = null;
  expect(
    await createTripDocumentOriginalRead(copy.ports).read(
      copy.actor.accountId,
      copy.request,
    ),
  ).toEqual(unavailable);
  expect(copy.ports.readRetained).not.toHaveBeenCalled();
  const source = fixture("PRIVATE_SOURCE_REFERENCE");
  source.graph.trip_operational_documents[0].source_representation_id = null;
  expect(
    await createTripDocumentOriginalRead(source.ports).read(
      source.actor.accountId,
      source.request,
    ),
  ).toEqual(unavailable);
  expect(source.ports.readRetained).not.toHaveBeenCalled();
});

it("rejects missing, revoked or wrong-kind custody rights and changed bytes", async () => {
  const f = fixture("PRIVATE_SOURCE_REFERENCE");
  const invalid = [
    null,
    { ...f.retained, state: "REVOKED" as const },
    { ...f.retained, right: "CURRENT_COPY_GRANT" as const },
    { ...f.retained, custodyReceiptId: randomUUID() },
    { ...f.retained, byteSize: f.bytes.byteLength + 1 },
  ];
  for (const retention of invalid)
    expect(
      await createTripDocumentOriginalRead({
        ...f.ports,
        readRetained: async () => (retention ? { ...retention, bytes: f.bytes } : null),
      }).read(f.actor.accountId, f.request),
    ).toEqual(unavailable);
  expect(
    await createTripDocumentOriginalRead({
      ...f.ports,
      readRetained: async () => ({
        ...f.retained,
        bytes: Uint8Array.from([37, 80, 68, 70, 45, 50]),
      }),
    }).read(f.actor.accountId, f.request),
  ).toEqual(unavailable);
});

it("checks current custody rights before requesting private bytes", async () => {
  const f = fixture("PRIVATE_SOURCE_REFERENCE");
  const readRetained = vi.fn(f.ports.readRetained);
  expect(
    await createTripDocumentOriginalRead({
      ...f.ports,
      readRetained,
      currentRetention: async () => ({ ...f.retained, right: "UNAVAILABLE" }),
    }).read(f.actor.accountId, f.request),
  ).toEqual(unavailable);
  expect(readRetained).not.toHaveBeenCalled();
});

it("withholds bytes after access revision, document revision or custody generation changes", async () => {
  const f = fixture();
  const changedGraph = structuredClone(f.graph);
  changedGraph.trip_operational_documents[0].revision = 2;
  const cases: Partial<OriginalReadPorts>[] = [
    {
      currentAccess: vi
        .fn()
        .mockResolvedValueOnce({ actor: f.actor, graph: f.graph, accessRevision: 1 })
        .mockResolvedValueOnce({ actor: f.actor, graph: f.graph, accessRevision: 2 }),
    },
    {
      currentAccess: vi
        .fn()
        .mockResolvedValueOnce({ actor: f.actor, graph: f.graph, accessRevision: 1 })
        .mockResolvedValueOnce({
          actor: f.actor,
          graph: changedGraph,
          accessRevision: 1,
        }),
    },
    {
      currentRetention: vi
        .fn()
        .mockResolvedValueOnce(f.retained)
        .mockResolvedValueOnce({ ...f.retained, generation: "new-generation" }),
    },
    {
      currentRetention: vi
        .fn()
        .mockResolvedValueOnce(f.retained)
        .mockResolvedValueOnce({ ...f.retained, right: "UNAVAILABLE" }),
    },
  ];
  for (const change of cases)
    expect(
      await createTripDocumentOriginalRead({ ...f.ports, ...change }).read(
        f.actor.accountId,
        f.request,
      ),
    ).toEqual(unavailable);
});

it("converts provider failures to the same unavailable result without returning private details", async () => {
  const f = fixture();
  expect(
    await createTripDocumentOriginalRead({
      ...f.ports,
      readRetained: async () => {
        throw new Error("private locator and provider details");
      },
    }).read(f.actor.accountId, f.request),
  ).toEqual(unavailable);
});
