import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  ordinaryFixture,
  ordinaryHash,
} from "../../src/domain/trip/__fixtures__/coreOrdinaryOrder";
import { applyCoreCommand } from "../../src/domain/trip/tripCoreV2Mutation";
import { authorizedTripVersionFromCollection } from "../../src/domain/trip/tripAuthorizedVersion";
import { buildCoreActorCollection } from "./tripCoreV2Collection";

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
    );
  const version = async (...args: Parameters<typeof collection>) =>
    authorizedTripVersionFromCollection(
      await collection(...args),
      args[3]?.accountId ?? f.actor.accountId,
      f.actor.tripId,
      ordinaryHash,
    );
  return { ...f, other, epoch, collection, version };
}
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
