import type { OrdinaryNode, OrdinaryGap } from "../tripCoreOrdinaryOrder";
import { createHash, randomUUID } from "node:crypto";
import { coreDefaults, corePlaceSchema } from "../tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreGraph,
  type CoreActor,
} from "../tripCoreV2Mutation";
import { coreDateBoundary } from "../tripCoreV2Temporal";
export const ordinaryHash = async (b: Uint8Array) =>
  createHash("sha256").update(b).digest("hex");
export const ordinaryTime = (hour = "09") => ({
  ...coreDateBoundary("2027-01-15"),
  zone_id: "UTC",
  local_time: hour + ":00:00",
  clock_precision: 0,
  quality: "ESTIMATED" as const,
});
export const ordinaryPlace = (lat = 1) => ({
  ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  accepted_latitude: lat,
  accepted_longitude: 2,
  location_input_revision: 1,
});
export function ordinaryFixture(overrides: Partial<CoreActor> = {}) {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: randomUUID(),
    personIds: [],
    active: true,
    canManageShared: false,
    ...overrides,
  };
  actor.personIds = [actor.personId!];
  const ids = Array.from({ length: 4 }, () => randomUUID()),
    orderId = randomUUID(),
    branchId = randomUUID();
  const command = <P>(
    name: string,
    id: string,
    payload: P,
    vector: { kind: string; id: string; revision: number | null }[],
  ) => ({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: actor.tripId,
    command: name,
    target: { kind: name === "SET_ORDINARY_ORDER" ? "ORDER" : "ITEM", id },
    baseVector: vector.sort((a, b) =>
      (a.kind + ":" + a.id).localeCompare(b.kind + ":" + b.id),
    ),
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload,
  });
  const creates = ids.map((id, i) =>
    command(
      "CREATE_ITEM",
      id,
      {
        family: "P1",
        core: { title: "Stop " + i },
        schedule: { start: ordinaryTime(String(9 + i).padStart(2, "0")) },
        place: ordinaryPlace(i + 1),
        ...coreDefaults("member"),
      },
      [{ kind: "ITEM", id, revision: null }],
    ),
  );
  let graph: CoreGraph = emptyCoreGraph();
  for (const q of creates)
    graph = applyCoreCommand(graph, q, actor, "2026-10-13T00:00:00Z").graph;
  const payload: {
    personId: string;
    branchId: string;
    nodes: OrdinaryNode[];
    gaps: OrdinaryGap[];
  } = {
    personId: actor.personId!,
    branchId,
    nodes: ids.map((eventId) => ({ eventId, entry: "START", exit: "START" })),
    gaps: ids.slice(0, -1).map((from, i) => ({
      from,
      to: ids[i + 1],
      coverage: "NONE_PROVEN",
      transportId: null,
      complete: true,
    })),
  };
  const order = command("SET_ORDINARY_ORDER", orderId, payload, [
    { kind: "ORDER", id: orderId, revision: null },
    ...ids.map((id) => ({ kind: "ITEM", id, revision: 1 })),
  ]);
  graph = applyCoreCommand(graph, order, actor, "2026-10-13T00:00:00Z").graph;
  return { actor, ids, orderId, branchId, graph, creates, order, command };
}
