import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreLifecycleGraphHash } from "./tripCoreV2Lifecycle";
import { emptyCoreGraph, applyCoreCommand, type CoreActor } from "./tripCoreV2Mutation";
import { coreDefaults } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { validateCoreCommand } from "./tripCoreV2Commands";
const actor: CoreActor = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  personId: null,
  personIds: [],
  active: true,
  canManageShared: false,
};
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const item = (id: string) => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: actor.tripId,
  command: "CREATE_ITEM",
  target: { kind: "ITEM", id },
  baseVector: [{ kind: "ITEM", id, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    family: "P1",
    core: { title: "planned" },
    schedule: { start: coreDateBoundary("2026-12-14") },
    ...coreDefaults("member"),
  },
});
it("hashes only the finite lifecycle closure, so unrelated private changes cannot alter its token", async () => {
  const id = randomUUID(),
    other = randomUUID(),
    g = applyCoreCommand(emptyCoreGraph(), item(id), actor, "2026-10-12T00:00:00Z").graph;
  const q = validateCoreCommand({
    ...item(id),
    command: "CANCEL_ARRANGEMENT",
    baseVector: [{ kind: "ITEM", id, revision: 1 }],
    payload: {
      scope: "ITEM_ONLY",
      affectedItems: [id],
      affectedBookings: [],
      graphHash: "0".repeat(64),
    },
  });
  const before = await coreLifecycleGraphHash(g, actor, q, hash);
  const added = applyCoreCommand(
    g,
    item(other),
    { ...actor, accountId: randomUUID() },
    "2026-10-12T00:00:00Z",
  ).graph;
  expect(await coreLifecycleGraphHash(added, actor, q, hash)).toBe(before);
  added.itinerary_events.find((r) => r.id === id)!.semantic_revision = 2;
  expect(await coreLifecycleGraphHash(added, actor, q, hash)).not.toBe(before);
});
