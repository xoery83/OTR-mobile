import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  emptyCoreGraph,
  applyCoreCommand,
  type CoreActor,
} from "@/domain/trip/tripCoreV2Mutation";
import { authorizedTripVersionFromCollection } from "@/domain/trip/tripAuthorizedVersion";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import {
  fixture,
  sha256,
  now,
} from "../repositories/__fixtures__/captureBatchAssessment";
import { ApiClientError } from "../api/client";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripAuthorizedVersionConsumer } from "./tripAuthorizedVersionConsumer";
import { acceptedVisibleVersion } from "./tripVisibleVersionRead";
import { refreshCoreDownstream } from "./tripDownstreamCoordinator";
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));
async function setup() {
  const f = fixture(true, 77),
    accountId = await f.getAccount(),
    tripId = randomUUID(),
    itemId = randomUUID();
  const actor: CoreActor = {
    accountId,
    tripId,
    active: true,
    canManageShared: true,
    personId: randomUUID(),
    personIds: [],
  };
  actor.personIds = [actor.personId!];
  const core = createTripCoreV2Repository(f.db, f.getAccount, sha256, now);
  const context = await core.captureContext(tripId);
  let revision = 0,
    generatedAt = now(),
    orderVersion: 1 | undefined;
  let graph = emptyCoreGraph();
  const epoch = randomUUID();
  const command = (title: string, initial = false) =>
    validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: initial ? "CREATE_ITEM" : "SET_ITEM_TEXT",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: initial ? null : revision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: initial
        ? {
            family: "P3",
            core: { title },
            ...coreDefaults("organizer"),
            schedule: {
              start: coreDateBoundary("2026-12-14"),
              end: coreDateBoundary("2026-12-17"),
            },
          }
        : { title },
    });
  const edit = (title: string, initial = false) => {
    graph = applyCoreCommand(graph, command(title, initial), actor, now()).graph;
    revision++;
  };
  edit("Original stay", true);
  const bundle = () =>
    buildCoreActorCollection(
      graph,
      actor,
      { epoch, revision, accessRevision: 7, generatedAt },
      [
        {
          person_id: actor.personId!,
          account_id: accountId,
          active: true,
          participating: true,
          revision: 1,
        },
      ],
      sha256,
      [],
      [],
      [],
      orderVersion,
    );
  const collection = vi.fn(bundle);
  const authorizedVersion = vi.fn(async () =>
    authorizedTripVersionFromCollection(await bundle(), accountId, tripId, sha256),
  );
  const consumer = createTripAuthorizedVersionConsumer({
    account: f.getAccount,
    transport: { authorizedVersion },
    hash: sha256,
  });
  cleanups.push(consumer.dispose);
  return {
    f,
    core,
    context,
    accountId,
    tripId,
    itemId,
    bundle,
    collection,
    authorizedVersion,
    consumer,
    command,
    edit,
    newerManifest() {
      generatedAt = "2026-10-09T00:00:00.000Z";
    },
    orderOne() {
      orderVersion = 1;
    },
    pull: () => refreshCoreDownstream(core, context, { collection }, consumer),
  };
}
it("cold starts with a validated full Apply, then skips a full Pull only for its exact opaque token", async () => {
  const f = await setup();
  expect(await f.pull()).toBe(true);
  expect(f.authorizedVersion).not.toHaveBeenCalled();
  expect(await f.pull()).toBe(false);
  expect(f.authorizedVersion).toHaveBeenCalledOnce();
  expect(f.collection).toHaveBeenCalledOnce();
  const scope = await f.core.acceptedSnapshot(f.context);
  expect(scope?.graph.itinerary_events[0].id).toBe(f.itemId);
});
it("visible P3 Edit takes the original collection path and retains the unsent same Item intent", async () => {
  const f = await setup();
  await f.pull();
  await f.core.enqueue(f.context, f.command("Pending own edit"));
  const queued = f.f.sql.prepare("SELECT * FROM sync_operations").all();
  f.edit("Remote edit");
  expect(await f.pull()).toBe(true);
  const accepted = await f.core.acceptedSnapshot(f.context);
  expect(accepted?.graph.itinerary_events[0]).toMatchObject({
    id: f.itemId,
    title: "Remote edit",
    semantic_revision: 2,
  });
  expect(f.f.sql.prepare("SELECT * FROM sync_operations").all()).toEqual(queued);
  expect(await f.pull()).toBe(false);
  expect(f.collection).toHaveBeenCalledTimes(2);
});
it("an existing cold Accepted snapshot alone is not paired with a fresh version GET", async () => {
  const f = await setup();
  await f.pull();
  f.consumer.dispose();
  f.f.reopen();
  f.newerManifest();
  const cold = createTripCoreV2Repository(f.f.db, f.f.getAccount, sha256, now);
  const consumer = createTripAuthorizedVersionConsumer({
    account: f.f.getAccount,
    transport: { authorizedVersion: f.authorizedVersion },
    hash: sha256,
  });
  cleanups.push(consumer.dispose);
  await refreshCoreDownstream(cold, f.context, { collection: f.collection }, consumer);
  expect(f.authorizedVersion).not.toHaveBeenCalled();
  expect(f.collection).toHaveBeenCalledTimes(2);
  expect((await cold.acceptedSnapshot(f.context))?.certificate.manifest_sha256).toBe(
    (await f.bundle()).manifest.manifestSha256,
  );
  await refreshCoreDownstream(cold, f.context, { collection: f.collection }, consumer);
  expect(f.authorizedVersion).toHaveBeenCalledOnce();
  expect(f.collection).toHaveBeenCalledTimes(2);
});
it("same semantic tuple with a changed local Applied generation forces re-pairing, not a token comparison", async () => {
  const f = await setup();
  await f.pull();
  await f.core.refresh(f.context, { collection: f.bundle });
  await f.pull();
  expect(f.authorizedVersion).not.toHaveBeenCalled();
  expect(f.collection).toHaveBeenCalledTimes(2);
});
it.each([
  new ApiClientError("offline", "network"),
  new ApiClientError("timeout", "timeout"),
  new ApiClientError("unavailable", "http", 503, "CORE_READ_UNAVAILABLE"),
])("a legitimate version outage falls back to the original full Pull", async (error) => {
  const f = await setup();
  await f.pull();
  f.authorizedVersion.mockRejectedValueOnce(error);
  await f.pull();
  expect(f.collection).toHaveBeenCalledTimes(2);
  await f.pull();
  expect(f.collection).toHaveBeenCalledTimes(2);
});
it.each([
  new ApiClientError("unauthorized", "http", 401, "INVALID_SESSION"),
  new ApiClientError("forbidden", "http", 403, "TRIP_READ_FORBIDDEN"),
  new ApiClientError("not visible", "http", 404, "NOT_VISIBLE"),
  new ApiClientError("invalid", "validation"),
])(
  "authorization/deny/invalid version errors do not become ordinary full Pull fallback",
  async (error) => {
    const f = await setup();
    await f.pull();
    f.authorizedVersion.mockRejectedValueOnce(error);
    await expect(f.pull()).rejects.toBe(error);
    expect(f.collection).toHaveBeenCalledOnce();
  },
);
it("a late ABA response is rejected and cannot seed a token under the new generation", async () => {
  const f = await setup();
  await f.pull();
  f.authorizedVersion.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    advanceAccountGeneration();
    return authorizedTripVersionFromCollection(
      await f.bundle(),
      f.accountId,
      f.tripId,
      sha256,
    );
  });
  await expect(f.pull()).rejects.toThrow();
  expect(f.collection).toHaveBeenCalledOnce();
  const context = await f.core.captureContext(f.tripId);
  await refreshCoreDownstream(f.core, context, { collection: f.collection }, f.consumer);
  expect(f.collection).toHaveBeenCalledTimes(2);
  expect(f.authorizedVersion).toHaveBeenCalledOnce();
});
it("a failed Core Apply never installs the token for the unaccepted collection", async () => {
  const f = await setup();
  await f.pull();
  f.edit("New revision");
  const refresh = vi
    .spyOn(f.core, "refresh")
    .mockRejectedValueOnce(Error("CAS_CONFLICT"));
  await expect(f.pull()).rejects.toThrow("CAS_CONFLICT");
  expect(
    (await f.core.acceptedSnapshot(f.context))?.graph.itinerary_events[0].title,
  ).toBe("Original stay");
  refresh.mockRestore();
  await f.pull();
  expect(f.collection).toHaveBeenCalledTimes(3);
  expect(
    (await f.core.acceptedSnapshot(f.context))?.graph.itinerary_events[0].title,
  ).toBe("New revision");
});
it("a stale Accepted observer cannot seed a baseline without the Repository CAS confirmation", async () => {
  const f = await setup();
  await f.core.refresh(f.context, { collection: f.bundle });
  const accepted = (await f.core.acceptedSnapshot(f.context))!;
  await f.consumer.observeAccepted!(
    f.context,
    accepted.certificate,
    await f.bundle(),
    async () => false,
  );
  const result = (await f.consumer(
    f.context,
    acceptedVisibleVersion(accepted.certificate),
    accepted.certificate,
  )) as { unchanged: boolean };
  expect(result.unchanged).toBe(false);
  expect(f.authorizedVersion).not.toHaveBeenCalled();
});
it("foreign Account/Trip tokens are rejected and projection order mode cannot reuse a baseline", async () => {
  const f = await setup();
  await f.pull();
  f.authorizedVersion.mockImplementationOnce(async () => ({
    version: "otr.core.authorized-trip-version/1",
    actorAccountId: randomUUID(),
    tripId: f.tripId,
    token: "a".repeat(64),
  }));
  await expect(f.pull()).rejects.toThrow("CORE_AUTHORIZED_VERSION_SCOPE_MISMATCH");
  expect(f.collection).toHaveBeenCalledOnce();
  f.orderOne();
  await f.core.refresh(f.context, { collection: f.bundle });
  await f.pull();
  expect(f.collection).toHaveBeenCalledTimes(2);
  await f.pull();
  expect(f.authorizedVersion).toHaveBeenLastCalledWith(f.context, 1);
});
it("two equal version GETs cannot certify a different full Collection token", async () => {
  const f = await setup();
  await f.pull();
  f.authorizedVersion.mockResolvedValue({
    version: "otr.core.authorized-trip-version/1",
    actorAccountId: f.accountId,
    tripId: f.tripId,
    token: "f".repeat(64),
  });
  await f.pull();
  await f.pull();
  expect(f.authorizedVersion).toHaveBeenCalledTimes(2);
  expect(f.collection).toHaveBeenCalledTimes(3);
});
