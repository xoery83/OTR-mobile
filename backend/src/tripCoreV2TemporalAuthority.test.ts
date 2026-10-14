import { expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { createCoreTemporalAuthority } from "./tripCoreV2TemporalAuthority";
import {
  emptyCoreGraph,
  applyCoreCommand,
  type CoreActor,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function setup() {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: randomUUID(),
    personIds: [],
    active: true,
    canManageShared: false,
  };
  actor.personIds = [actor.personId!];
  const itemId = randomUUID(),
    scope = { epoch: randomUUID(), accessRevision: 1 };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: actor.tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "planned" },
        schedule: { start: coreDateBoundary("2027-02-06") },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  const input = {
    actorAccountId: actor.accountId,
    tripId: actor.tripId,
    personId: actor.personId!,
    ...scope,
    itemId,
    itemRevision: 1,
    operationId: randomUUID(),
    localDate: "2027-02-06",
    localTime: "08:00:00",
    zone: "Asia/Tokyo",
    precision: 0 as const,
  };
  return {
    actor,
    scope,
    graph,
    input,
    issuer: createCoreTemporalAuthority(actor, scope, hash),
  };
}
it("issuer proves unique named-zone second and owning admission rejects a forged unissued tuple", async () => {
  const s = setup(),
    e = await s.issuer.issue(s.input, s.graph);
  expect(e.boundary).toMatchObject({
    instant: "2027-02-05T23:00:00Z",
    clock_precision: 0,
    quality: "EXACT",
    civil_resolution: "UNIQUE",
    resolution_offset_seconds: 32400,
  });
  const q = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: s.input.operationId,
    tripId: s.actor.tripId,
    command: "SET_ITEM_SCHEDULE",
    target: { kind: "ITEM", id: s.input.itemId },
    baseVector: [{ kind: "ITEM", id: s.input.itemId, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { schedule: { start: e.boundary } },
  });
  const intent = await coreHashValue("otr-trip-core-intent-v2", q, hash);
  expect(await s.issuer.verify(q, intent, s.graph)).toEqual([e]);
  await expect(
    createCoreTemporalAuthority(s.actor, s.scope, hash).verify(q, intent, s.graph),
  ).rejects.toThrow("OWNING_CAPABILITY_REQUIRED");
  const changed = structuredClone(q);
  (changed.payload as any).schedule.start.local_time = "09:00:00";
  await expect(
    s.issuer.verify(
      changed,
      await coreHashValue("otr-trip-core-intent-v2", changed, hash),
      s.graph,
    ),
  ).rejects.toThrow("EVIDENCE_MISMATCH");
  s.graph.itinerary_events[0].semantic_revision = 2;
  await expect(s.issuer.verify(q, intent, s.graph)).rejects.toThrow("SCOPE_DENIED");
});
it("gap/fold, minute precision, invalid zone/date and foreign scope stay unqualified", async () => {
  const s = setup();
  for (const change of [
    { localDate: "2027-03-14", localTime: "02:30:00", zone: "America/New_York" },
    { localDate: "2027-11-07", localTime: "01:30:00", zone: "America/New_York" },
    { zone: "+09:00" },
    { localDate: "2027-02-30" },
    { actorAccountId: randomUUID() },
    { epoch: randomUUID() },
    { accessRevision: 2 },
    { precision: -1 },
  ])
    await expect(
      s.issuer.issue({ ...s.input, ...change } as never, s.graph),
    ).rejects.toThrow();
});
