import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { readCorePgGraph, type CorePgLease } from "./tripCoreV2PgStorage";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
const actor = {
  accountId: randomUUID(),
  tripId: randomUUID(),
  personId: null,
  personIds: [],
  active: true,
  canManageShared: false,
};
const command = (boundary: unknown) => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: actor.tripId,
  command: "CREATE_ITEM",
  target: { kind: "ITEM", id: randomUUID() },
  baseVector: [],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    family: "P4",
    core: { title: "2026-10-12Tliteral+00:00" },
    schedule: { start: boundary },
    ...coreDefaults("member"),
  },
});
it("restores PostgreSQL trailing-zero precision without modifying authored title text", async () => {
  const q = command({
    ...coreDateBoundary("2026-12-14"),
    local_time: "11:00:00.120000",
    clock_precision: 6,
    instant: "2026-12-14T11:00:00.120000Z",
    source_instant: "2026-12-14T11:00:00.120000Z",
    source_instant_precision: 6,
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
  });
  const input = { ...q, baseVector: [{ kind: "ITEM", id: q.target.id, revision: null }] };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    input,
    actor,
    "2026-10-12T00:00:00Z",
  ).graph;
  graph.itinerary_events[0].start_local_time = "11:00:00.12";
  graph.itinerary_events[0].start_source_instant = "2026-12-14T11:00:00.12+00:00";
  graph.itinerary_events[0].planned_start = "2026-12-14T11:00:00.12+00:00";
  const lease: CorePgLease = {
    retire() {},
    async query(sql) {
      const table = /FROM public\."([^"]+)"/.exec(sql)?.[1] as keyof CoreGraph;
      return { rows: table ? graph[table].map((fact) => ({ fact })) : [] };
    },
  };
  const decoded = await readCorePgGraph(lease, actor.tripId);
  expect(decoded.itinerary_events[0]).toMatchObject({
    title: "2026-10-12Tliteral+00:00",
    start_local_time: "11:00:00.120000",
    start_source_instant: "2026-12-14T11:00:00.120000Z",
    planned_start: "2026-12-14T11:00:00.120000Z",
  });
  graph.itinerary_events[0].start_source_instant = "2026-12-14T11:00:00.120001+00:00";
  graph.itinerary_events[0].start_source_instant_precision = 3;
  await expect(readCorePgGraph(lease, actor.tripId)).rejects.toThrow(
    "INVALID_CLOCK_PRECISION",
  );
});
