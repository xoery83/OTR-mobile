import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyCoreGraph } from "../../domain/trip/tripCoreV2Mutation";
import { localImportDocumentId } from "../../domain/trip/universalImportIdentity";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import type { CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";
import { localItemImportOriginals } from "./localItemImportOriginals";

const h = vi.hoisted(() => ({
  accountId: "",
  generation: 4,
  snapshot: null as CoreAcceptedSnapshot | null,
  files: new Map<string, Uint8Array>(),
  read: vi.fn(),
  jobs: [] as CaptureJobReadModel[],
  retained: vi.fn(),
}));
vi.mock("../auth/accountGeneration", () => ({
  getAccountGeneration: () => h.generation,
}));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: async () => h.accountId,
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => ({}) }));
vi.mock("../repositories/tripCoreSha256", () => ({ tripCoreSha256Hex: vi.fn() }));
vi.mock("../repositories/tripCoreV2Repository", () => ({
  createTripCoreV2Repository: () => ({
    captureContext: async (tripId: string) => ({
      accountId: h.accountId,
      generation: h.generation,
      tripId,
    }),
    acceptedSnapshot: async () => h.snapshot,
  }),
}));
vi.mock("./defaultImportDocuments", () => ({
  getDefaultImportDocumentsRepository: async () => ({ read: h.retained }),
}));
vi.mock("./defaultCaptureSubmission", () => ({
  getDefaultCaptureSubmissionRepository: async () => ({ list: async () => h.jobs }),
}));
vi.mock("expo-crypto", () => ({ randomUUID }));
vi.mock("expo-file-system", () => ({
  Paths: { document: "app-private" },
  Directory: class {
    path: string;
    constructor(...parts: string[]) {
      this.path = parts.join("/");
    }
  },
  File: class {
    path: string;
    constructor(directory: { path: string }, name: string) {
      this.path = directory.path + "/" + name;
    }
    get exists() {
      return h.files.has(this.path);
    }
    get size() {
      return h.files.get(this.path)?.length;
    }
    async bytes() {
      h.read(this.path);
      return h.files.get(this.path);
    }
  },
}));

const account = randomUUID(),
  member = randomUUID(),
  trip = randomUUID(),
  item = randomUUID();
const bytes = new TextEncoder().encode("Harbour workshop");
const digest = createHash("sha256").update(bytes).digest("hex");
const id = localImportDocumentId(account, trip, digest);
const path = "app-private/import-originals/" + account + "/" + digest;
const reader = () => localItemImportOriginals(trip, item, 4);

beforeEach(() => {
  h.accountId = account;
  h.generation = 4;
  h.files.clear();
  h.jobs = [];
  h.retained.mockReset();
  h.read.mockReset();
  const graph = emptyCoreGraph();
  graph.itinerary_events.push({
    id: item,
    trip_id: trip,
    visibility: "GROUP",
    owner_account_id: member,
  });
  graph.trip_operational_documents.push({
    id,
    trip_id: trip,
    visibility: "PRIVATE",
    owner_account_id: account,
    custody: "LOCAL_ONLY",
    title: "retained.txt",
    media_type: "text/plain",
    sha256: digest,
    byte_size: bytes.length,
  });
  graph.trip_item_document_links.push({
    item_id: item,
    document_id: id,
    trip_id: trip,
    active: true,
  });
  h.snapshot = {
    graph,
    actor: {
      active: true,
      accountId: account,
      tripId: trip,
      personId: null,
      personIds: [],
      canManageShared: false,
    },
    certificate: {
      epoch: randomUUID(),
      revision: "1",
      access_revision: 1,
      applied_generation: 1,
      actor_person_binding_hash: digest,
      roster_hash: digest,
      manifest_sha256: digest,
      ordinary_order_version: 0,
    },
    participatingPersonIds: [],
  };
});

it("lists and opens the owner’s original linked to a readable Item only on the holding device", async () => {
  h.files.set(path, bytes);
  const scoped = await reader();
  expect(await scoped.list()).toMatchObject([{ id, title: "retained.txt" }]);
  expect(h.read).not.toHaveBeenCalled();
  expect(await scoped.original(id)).toMatchObject({
    document: { id, sha256: digest },
    bytes,
  });
  expect(h.read).toHaveBeenCalledExactlyOnceWith(path);
});

it("hides the attachment when the current device lacks the original", async () => {
  const scoped = await reader();
  expect(await scoped.list()).toEqual([]);
  expect(await scoped.original(id)).toBeNull();
  expect(h.read).not.toHaveBeenCalled();
});

it("denies another Member even when stale metadata and matching bytes exist", async () => {
  h.files.set(path, bytes);
  h.accountId = member;
  h.snapshot!.actor.accountId = member;
  h.snapshot!.graph.trip_operational_documents[0].visibility = "GROUP";
  const scoped = await reader();
  expect(await scoped.list()).toEqual([]);
  expect(await scoped.original(id)).toBeNull();
  expect(h.read).not.toHaveBeenCalled();
});

it.each(["wrong-id", "wrong-trip", "unlinked", "hidden-item", "inactive"])(
  "rejects %s before reading the device file",
  async (invalid) => {
    h.files.set(path, bytes);
    const { graph, actor } = h.snapshot!;
    if (invalid === "wrong-id") {
      graph.trip_operational_documents[0].id = member;
      graph.trip_item_document_links[0].document_id = member;
    }
    if (invalid === "wrong-trip") actor.tripId = member;
    if (invalid === "unlinked") graph.trip_item_document_links[0].active = false;
    if (invalid === "hidden-item") graph.itinerary_events[0].hidden_at = "2026-11-10";
    if (invalid === "inactive") actor.active = false;
    const scoped = await reader();
    expect(await scoped.list()).toEqual([]);
    expect(await scoped.original(invalid === "wrong-id" ? member : id)).toBeNull();
    expect(h.read).not.toHaveBeenCalled();
  },
);

it("rechecks the current relationship and fails closed on same-length corrupt bytes or account change", async () => {
  h.files.set(path, bytes);
  const scoped = await reader();
  expect(await scoped.list()).toHaveLength(1);
  h.snapshot!.graph.trip_item_document_links[0].active = false;
  expect(await scoped.original(id)).toBeNull();
  h.snapshot!.graph.trip_item_document_links[0].active = true;
  h.files.set(path, new Uint8Array(bytes.length));
  await expect(scoped.original(id)).rejects.toThrow("IMPORT_ORIGINAL_INTEGRITY");
  h.files.set(path, bytes);
  h.generation += 1;
  await expect(scoped.original(id)).rejects.toThrow("Account changed");
});

it("does not expose bytes if the association is revoked during the device read", async () => {
  h.files.set(path, bytes);
  h.read.mockImplementationOnce(() => {
    h.snapshot!.graph.trip_item_document_links[0].active = false;
  });
  const scoped = await reader();
  expect(await scoped.original(id)).toBeNull();
});

it("directory metadata survives missing local bytes and does not require an Item link", async () => {
  h.snapshot!.graph.trip_item_document_links = [];
  const directory = await localItemImportOriginals(trip, undefined, 4);
  expect(await directory.metadata()).toMatchObject([
    { id, title: "retained.txt", visibility: "PRIVATE" },
  ]);
  expect(await directory.original(id)).toBeNull();
  expect(h.read).not.toHaveBeenCalled();
  expect(await (await reader()).list()).toEqual([]);
});
it("directory metadata cannot expose another Account's private document", async () => {
  h.accountId = member;
  h.snapshot!.actor.accountId = member;
  expect(await (await localItemImportOriginals(trip, undefined, 4)).metadata()).toEqual(
    [],
  );
});

it("projects actual direct links once, independently of file availability and Batch membership", async () => {
  const scoped = await localItemImportOriginals(trip, undefined, 4);
  Object.assign(h.snapshot!.graph.itinerary_events[0], {
    title: "Existing stay",
    experience_family: "P3",
  });
  h.snapshot!.graph.trip_item_document_links.push({
    ...h.snapshot!.graph.trip_item_document_links[0],
  });
  expect(await scoped.relationships(id)).toEqual([
    { id: item, title: "Existing stay", family: "P3" },
  ]);
  h.snapshot!.graph.itinerary_events[0].hidden_at = "2026-11-14";
  expect(await scoped.relationships(id)).toEqual([]);
  expect(h.read).not.toHaveBeenCalled();
});

it("does not expose an unreadable Item through a Document link", async () => {
  h.snapshot!.graph.itinerary_events[0].visibility = "PRIVATE";
  const scoped = await localItemImportOriginals(trip, undefined, 4);
  expect(await scoped.relationships(id)).toEqual([]);
  expect(await scoped.relationships(randomUUID())).toEqual([]);
});

it("maps only accepted original identity and exact Account/Trip to real Batch, never filename proximity", async () => {
  const job = (accountId: string, tripId: string, sha: string, state = "ACCEPTED") =>
    ({
      batch: {
        accountId,
        jobId: randomUUID(),
        batchId: randomUUID(),
        createdAt: "2026-11-14T10:00:00.000Z",
        context: { tripPrior: { id: tripId } },
      },
      inputs: [{ state, contentSha256: sha, contentByteCount: bytes.length }],
    }) as unknown as CaptureJobReadModel;
  const exact = job(account, trip, digest);
  h.jobs = [
    exact,
    job(member, trip, digest),
    job(account, member, digest),
    job(account, trip, "a".repeat(64)),
    job(account, trip, digest, "PENDING"),
  ];
  const scoped = await localItemImportOriginals(trip, undefined, 4);
  expect(await scoped.batches(id)).toMatchObject([
    { jobId: exact.batch.jobId, documents: [{ id }] },
  ]);
  expect(await scoped.batches(randomUUID())).toEqual([]);
  expect(h.read).not.toHaveBeenCalled();
});

it("keeps legitimately shared metadata discoverable without granting the other Member original access", async () => {
  h.accountId = member;
  h.snapshot!.actor.accountId = member;
  h.snapshot!.graph.trip_operational_documents[0].visibility = "GROUP";
  h.files.set(path, bytes);
  const scoped = await localItemImportOriginals(trip, undefined, 4);
  expect(await scoped.metadata()).toMatchObject([
    { id, canOpenOriginal: false, localAvailable: false },
  ]);
  expect(await scoped.original(id)).toBeNull();
  expect(await scoped.batches(id)).toEqual([]);
  expect(h.read).not.toHaveBeenCalled();
});

it("includes a same-Batch retained original without a Core Item or Document, using its existing private reader", async () => {
  const captureId = randomUUID(),
    payloadId = randomUUID(),
    otherSha = "b".repeat(64);
  const retained = {
    captureId,
    payloadId,
    sha256: otherSha,
    byteCount: 5,
    tripId: null,
    accountId: account,
    originalFilename: "abstain.txt",
  };
  h.retained.mockImplementation(async (_context, directory) => {
    if (directory === "TRIP") throw Error("DOCUMENTS_NOT_FOUND");
    return retained;
  });
  h.jobs = [
    {
      batch: {
        accountId: account,
        jobId: randomUUID(),
        batchId: randomUUID(),
        createdAt: "2026-11-14T10:00:00.000Z",
        context: { tripPrior: { id: trip } },
      },
      inputs: [
        { state: "ACCEPTED", contentSha256: digest, contentByteCount: bytes.length },
        {
          state: "ACCEPTED",
          contentSha256: otherSha,
          contentByteCount: 5,
          captureId,
          payloadId,
        },
      ],
    },
  ] as unknown as CaptureJobReadModel[];
  const batches = await (await localItemImportOriginals(trip, undefined, 4)).batches(id);
  expect(batches[0].documents).toHaveLength(1);
  expect(batches[0].otherOriginals).toEqual([retained]);
  expect(h.retained).toHaveBeenLastCalledWith(
    expect.objectContaining({ accountId: account, tripId: "" }),
    "PERSONAL_INBOX",
    captureId,
  );
  h.retained.mockResolvedValue({ ...retained, payloadId: randomUUID() });
  expect(
    (await (await localItemImportOriginals(trip, undefined, 4)).batches(id))[0]
      .otherOriginals,
  ).toEqual([]);
  expect(h.read).not.toHaveBeenCalled();
});
