import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  ordinaryFixture,
  ordinaryHash,
} from "../../src/domain/trip/__fixtures__/coreOrdinaryOrder";
import { applyCoreCommand } from "../../src/domain/trip/tripCoreV2Mutation";
import { authorizedTripVersionFromCollection } from "../../src/domain/trip/tripAuthorizedVersion";
import { buildCoreActorCollection } from "./tripCoreV2Collection";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";

function fixture() {
  const f = ordinaryFixture();
  const other = { ...f.actor, accountId: randomUUID(), personId: randomUUID() };
  other.personIds = [other.personId];
  const epoch = randomUUID();
  const bindings = [f.actor, other].map((a) => ({
    person_id: a.personId!,
    account_id: a.accountId,
    active: true,
    participating: true,
    revision: 1,
  }));
  const collection = (
    graph = f.graph,
    revision = 1,
    selectedEpoch = epoch,
    actor = f.actor,
    authorizedEvidenceRefs: readonly string[] = [],
  ) =>
    buildCoreActorCollection(
      graph,
      actor,
      {
        epoch: selectedEpoch,
        revision,
        accessRevision: revision,
        generatedAt: revision === 1 ? "2026-10-31T00:00:00Z" : "2026-10-31T00:01:00Z",
      },
      bindings,
      ordinaryHash,
      [],
      [],
      authorizedEvidenceRefs,
    );
  const version = async (...args: Parameters<typeof collection>) =>
    authorizedTripVersionFromCollection(
      await collection(...args),
      args[3]?.accountId ?? f.actor.accountId,
      f.actor.tripId,
      ordinaryHash,
    );
  return { ...f, other, epoch, bindings, collection, version };
}

it("legal P3 detail and room edits both advance their owning Item revision", async () => {
  const f = fixture(),
    id = randomUUID(),
    room = randomUUID();
  const create = {
    ...f.creates[0],
    operationId: randomUUID(),
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    payload: {
      ...f.creates[0].payload,
      family: "P3",
      schedule: {
        start: coreDateBoundary("2027-01-15"),
        end: coreDateBoundary("2027-01-17"),
      },
    },
  };
  let graph = applyCoreCommand(f.graph, create, f.actor, "2026-10-31T00:00:00Z").graph;
  const original = await f.version(graph);
  for (const [index, category] of ["Standard", "Twin"].entries()) {
    graph = applyCoreCommand(
      graph,
      f.command(
        "SET_STAY_DETAILS",
        id,
        {
          details: {
            property_name: "Synthetic lodge",
            permitted_checkin_from: null,
            permitted_checkin_until: null,
            permitted_checkout_by: null,
          },
          rooms: [{ room_id: room, category, quantity: 1, capacity: 2 }],
        },
        [{ kind: "ITEM", id, revision: index + 1 }],
      ),
      f.actor,
      "2026-10-31T00:01:00Z",
    ).graph;
    expect(graph.itinerary_events.find((r) => r.id === id)?.semantic_revision).toBe(
      index + 2,
    );
    expect(graph.trip_stay_rooms.find((r) => r.room_id === room)?.category).toBe(
      category,
    );
    expect((await f.version(graph, index + 2)).token).not.toBe(original.token);
  }
});

it("a person binding change must invalidate even when all Item revisions stay unchanged", async () => {
  const f = fixture();
  const revisions = f.graph.itinerary_events.map((r) => r.semantic_revision);
  const before = await f.version();
  f.bindings[1].active = false;
  expect(f.graph.itinerary_events.map((r) => r.semantic_revision)).toEqual(revisions);
  expect((await f.version()).token).not.toBe(before.token);
});

it("evidence masking can change the visible token without changing any Item revision", async () => {
  const f = fixture();
  const ref = "SYNTHETIC_VERSION_PROOF_REFERENCE";
  f.graph.itinerary_events[0].field_state = {
    "itinerary_events.title": {
      state: "KNOWN",
      origin: "SOURCE",
      protected: false,
      changed_revision: 1,
      evidence_ref: ref,
    },
  };
  const revisions = f.graph.itinerary_events.map((r) => r.semantic_revision);
  const masked = await f.version();
  const unmasked = await f.version(f.graph, 1, f.epoch, f.actor, [ref]);
  expect(f.graph.itinerary_events.map((r) => r.semantic_revision)).toEqual(revisions);
  expect(unmasked.token).not.toBe(masked.token);
});
it("a foreign PRIVATE create changes global counters but not this Actor's version", async () => {
  const f = fixture();
  const before = await f.version();
  const id = randomUUID();
  const command = {
    ...f.creates[0],
    operationId: randomUUID(),
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
  };
  const graph = applyCoreCommand(f.graph, command, f.other, "2026-10-31T00:00:00Z").graph;
  expect(graph.itinerary_events).toHaveLength(f.graph.itinerary_events.length + 1);
  const afterCollection = await f.collection(graph, 2);
  expect(afterCollection.manifest.manifestSha256).not.toBe(
    (await f.collection()).manifest.manifestSha256,
  );
  expect((await f.version(graph, 2)).token).toBe(before.token);
});
it("visible edits and epoch changes invalidate the version", async () => {
  const f = fixture();
  const before = await f.version();
  const graph = applyCoreCommand(
    f.graph,
    f.command("SET_ITEM_TEXT", f.ids[0], { title: "Visible edit" }, [
      { kind: "ITEM", id: f.ids[0], revision: 1 },
    ]),
    f.actor,
    "2026-10-31T00:00:00Z",
  ).graph;
  expect((await f.version(graph, 2)).token).not.toBe(before.token);
  expect((await f.version(f.graph, 1, randomUUID())).token).not.toBe(before.token);
});
it("binds the Actor and rejects mismatched or tampered collections", async () => {
  const f = fixture();
  expect((await f.version(f.graph, 1, f.epoch, f.other)).token).not.toBe(
    (await f.version()).token,
  );
  const collection = await f.collection();
  await expect(
    authorizedTripVersionFromCollection(
      collection,
      f.other.accountId,
      f.actor.tripId,
      ordinaryHash,
    ),
  ).rejects.toThrow("CORE_READ_SCOPE_MISMATCH");
  collection.pages[0].records[0].revision++;
  await expect(
    authorizedTripVersionFromCollection(
      collection,
      f.actor.accountId,
      f.actor.tripId,
      ordinaryHash,
    ),
  ).rejects.toThrow();
});
