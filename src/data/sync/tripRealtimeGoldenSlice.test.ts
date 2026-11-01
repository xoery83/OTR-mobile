import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { executeCoreCommandV2, type CoreCommandStorage } from "../../../backend/src/tripCoreV2Commands";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import { fixture, sha256, now } from "../repositories/__fixtures__/captureBatchAssessment";
import { createTripPrivateRealtimeAuthorization } from "../auth/tripPrivateRealtimeAuthorization";
import { createTripDownstreamCoordinator, refreshCoreDownstream } from "./tripDownstreamCoordinator";
import { createTripRealtimeTrigger } from "./tripRealtimeTrigger";
import { tripPrivateSubscription } from "./tripPrivateSubscription";
import { sameVisibleVersion, tripVisibleVersionRead, type CoreVisibleVersionRead } from "./tripVisibleVersionRead";

vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));

it("fixture P3 APPLIED → authorized hint/version → existing Pull → same SQLite Item, retaining Pending and catching missed signals", async () => {
  vi.useFakeTimers();
  const f = fixture(true, 77);
  const accountB = await f.getAccount(), tripId = randomUUID(), itemId = randomUUID();
  const actorA: CoreActor = {
    accountId: randomUUID(), tripId, active: true, canManageShared: true,
    personId: randomUUID(), personIds: [],
  };
  const actorB: CoreActor = {
    ...actorA, accountId: accountB, personId: randomUUID(), personIds: [],
  };
  actorA.personIds = [actorA.personId!];
  actorB.personIds = [actorB.personId!];
  let graph = emptyCoreGraph(), revision = 0;
  const epoch = randomUUID();
  const storage: CoreCommandStorage = {
    async withLockedCommand(_scope, work) {
      return work({
        actor: actorA,
        readReceipt: async () => null,
        hasLegacyOperation: async () => false,
        canReadReceipt: async () => true,
        enabledCommands: async () => ["CREATE_ITEM", "SET_ITEM_TEXT"],
        readLockedGraph: async () => graph,
        verifyAdmission: async () => {},
        lifecycleGraphHash: async () => undefined,
        async commit(mutation) {
          if (mutation) { graph = mutation.graph; revision++; }
          return randomUUID();
        },
      });
    },
  };
  const command = (base: number | null, title: string) => ({
    contractVersion: 2, intentVersion: 2, operationId: randomUUID(), tripId,
    command: base === null ? "CREATE_ITEM" : "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: base }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: base === null ? {
      family: "P3", core: { title }, ...coreDefaults("organizer"),
      schedule: { start: coreDateBoundary("2026-12-14"), end: coreDateBoundary("2026-12-17") },
    } : { title },
  });
  const commit = (input: unknown) =>
    executeCoreCommandV2(storage, actorA.accountId, tripId, input, sha256, now);
  const created = await commit(command(null, "Client A stay"));
  expect(created.projection === "FULL" && created.receipt.outcome).toBe("APPLIED");
  const core = createTripCoreV2Repository(f.db, f.getAccount, sha256, now);
  const context = await core.captureContext(tripId);
  const snapshot = () => buildCoreActorCollection(graph, actorB, {
    epoch, revision, accessRevision: 7, generatedAt: now(),
  }, [actorA, actorB].map((actor) => ({
    person_id: actor.personId!, account_id: actor.accountId,
    active: true, participating: true, revision: 1,
  })), sha256);
  const collection = vi.fn(snapshot);
  // Fixture comparison builds a full authorized snapshot; this is NOT a cheap server Reader.
  const versionRead: CoreVisibleVersionRead = vi.fn(async (scope, compared) => {
    const m = (await snapshot()).manifest;
    return { context: scope, compared, unchanged: sameVisibleVersion(compared, {
      epoch: m.epoch, revision: m.revision, accessRevision: m.accessRevision,
      actorPersonBindingHash: m.actorPersonBindingHash,
      participatingRosterHash: m.participatingRosterHash,
      ordinaryOrderVersion: m.ordinaryOrderVersion ?? 0,
    }) };
  });
  const notify = vi.fn();
  const downstream = createTripDownstreamCoordinator({
    account: f.getAccount, scope: async () => context, discover: async () => [], notify,
    pull: async () => refreshCoreDownstream(core, context, { collection }, versionRead),
  });
  type Events = Parameters<NonNullable<Parameters<typeof createTripPrivateRealtimeAuthorization>[0]["open"]>>[1];
  let events!: Events;
  const leaseId = randomUUID();
  const accessRevoked = vi.fn(async () => {});
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: f.getAccount, accessRevoked,
    open: async (_scope, callbacks) => {
      events = callbacks;
      return { lease: {
        accountId: accountB, tripId, actorPersonId: actorB.personId!, leaseId,
        channel: "fixture-private-channel", authorizationRevision: 41,
        expiresAt: Date.now() + 86_400_000,
      }, close: () => {} };
    },
  });
  const trigger = createTripRealtimeTrigger({
    account: f.getAccount, available: async () => true,
    invalidate: downstream.invalidate, subscribe,
  });
  const accepted = async () => {
    const value = await core.acceptedSnapshot(context);
    expect(value?.graph.itinerary_events[0].id).toBe(itemId);
    return value!;
  };
  try {
    expect(tripPrivateSubscription).toBeUndefined();
    expect(tripVisibleVersionRead).toBeUndefined();
    await trigger.activate(context);
    expect(JSON.parse((await accepted()).certificate.revision)).toBe(1);
    expect((await accepted()).graph.itinerary_events[0].semantic_revision).toBe(1);
    const local = command(1, "Client B unsent conflict");
    await core.enqueue(context, local);
    const queued = f.sql.prepare("SELECT * FROM sync_operations").all();
    const edited = await commit(command(1, "Client A renamed stay"));
    expect(edited.projection === "FULL" && edited.receipt.outcome).toBe("APPLIED");
    events.invalidated({ leaseId, authorizationRevision: 41 });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(async () => expect(JSON.parse((await accepted()).certificate.revision)).toBe(2));
    expect((await accepted()).graph.itinerary_events[0].title).toBe("Client A renamed stay");
    expect((await accepted()).graph.itinerary_events[0].semantic_revision).toBe(2);
    expect(f.sql.prepare("SELECT * FROM sync_operations").all()).toEqual(queued);
    expect((await core.pending(context))[0].command.operationId).toBe(local.operationId);
    const conflict = await commit(command(1, "Stale remote change"));
    expect(conflict.projection === "FULL" && conflict.receipt.outcome).toBe("CONFLICT");
    expect(revision).toBe(2);
    const pulls = collection.mock.calls.length;
    events.invalidated({ leaseId, authorizationRevision: 41 });
    await vi.advanceTimersByTimeAsync(250);
    expect(collection).toHaveBeenCalledTimes(pulls);
    events.disconnected();
    await commit(command(2, "Missed while disconnected"));
    events.invalidated({ leaseId, authorizationRevision: 41 });
    await vi.advanceTimersByTimeAsync(250);
    expect(JSON.parse((await accepted()).certificate.revision)).toBe(2);
    await trigger.activate(context);
    expect(JSON.parse((await accepted()).certificate.revision)).toBe(3);
    expect((await accepted()).graph.itinerary_events[0].semantic_revision).toBe(3);
    f.reopen();
    const cold = createTripCoreV2Repository(f.db, f.getAccount, sha256, now);
    expect((await cold.acceptedSnapshot(context))?.graph.itinerary_events[0].id).toBe(itemId);
    expect(f.sql.prepare("SELECT * FROM sync_operations").all()).toEqual(queued);
    const beforeRevoke = collection.mock.calls.length;
    // Auth receipt revision42 is NOT translated into Core accessRevision7 or a SQLite revoke.
    events.revoked({ accountId: accountB, tripId, receiptId: randomUUID(), authorizationRevision: 42 });
    events.invalidated({ leaseId, authorizationRevision: 41 });
    await vi.advanceTimersByTimeAsync(250);
    expect(accessRevoked).toHaveBeenCalledOnce();
    expect(collection).toHaveBeenCalledTimes(beforeRevoke);
    expect(notify).toHaveBeenCalledTimes(3);
  } finally {
    trigger.dispose();
    vi.useRealTimers();
  }
});
