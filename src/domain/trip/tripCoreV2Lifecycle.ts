import { coreKindTables, type CoreKind } from "./tripCoreV2";
import { type CoreCommand } from "./tripCoreV2Commands";
import { coreCanRead, type CoreActor, type CoreGraph } from "./tripCoreV2Mutation";
import { coreHashValue } from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";
// The owning reader must supply the full scoped graph, not infer global closure from an actor mirror.
export async function coreLifecycleGraphHash(
  graph: CoreGraph,
  actor: CoreActor,
  command: CoreCommand,
  hash: ImportHash,
) {
  const payload = command.payload as {
    scope?: string;
    affectedItems?: string[];
    affectedBookings?: string[];
    affectedIds?: { kind: CoreKind; id: string }[];
    transferEntitlementIds?: string[];
    newBookingId?: string;
  };
  const roots = new Map<
    string,
    { kind: CoreKind; id: string; revision: number | null }
  >();
  function add(kind: CoreKind, id: string) {
    const key = kind + ":" + id;
    if (roots.has(key)) return false;
    const row = graph[coreKindTables[kind]].find((r) => r.id === id);
    if (!row || !coreCanRead(graph, actor, kind, row)) throw new Error("NOT_VISIBLE");
    roots.set(key, {
      kind,
      id,
      revision: row[kind === "ITEM" ? "semantic_revision" : "revision"] as number,
    });
    if (roots.size > 32) throw new Error("INVALID_AGGREGATE");
    return true;
  }
  add(command.target.kind as CoreKind, command.target.id);
  for (const id of payload.affectedItems ?? []) add("ITEM", id);
  for (const id of payload.affectedBookings ?? []) add("BOOKING", id);
  for (const root of payload.affectedIds ?? []) add(root.kind, root.id);
  for (const id of payload.transferEntitlementIds ?? []) add("ENTITLEMENT", id);
  const edges: {
    relation: string;
    parent: { kind: CoreKind; id: string };
    child: { kind: CoreKind; id: string };
    active: boolean;
  }[] = [];
  const includeGraph =
    command.command === "REPLACE_BOOKING" ||
    ["EXCLUSIVE_ARRANGEMENT", "WHOLE_BOOKING"].includes(payload.scope ?? "");
  if (includeGraph) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.trip_booking_item_links) {
        if (
          !edge.active ||
          !(roots.has("BOOKING:" + edge.booking_id) || roots.has("ITEM:" + edge.item_id))
        )
          continue;
        changed = add("BOOKING", edge.booking_id as string) || changed;
        changed = add("ITEM", edge.item_id as string) || changed;
      }
    }
    for (const edge of graph.trip_booking_item_links)
      if (roots.has("BOOKING:" + edge.booking_id) && roots.has("ITEM:" + edge.item_id))
        edges.push({
          relation: "trip_booking_item_links",
          parent: { kind: "BOOKING", id: edge.booking_id as string },
          child: { kind: "ITEM", id: edge.item_id as string },
          active: edge.active as boolean,
        });
    if (command.command === "REPLACE_BOOKING")
      for (const edge of graph.trip_booking_entitlement_links)
        if (edge.booking_id === command.target.id && edge.active) {
          add("ENTITLEMENT", edge.entitlement_id as string);
          edges.push({
            relation: "trip_booking_entitlement_links",
            parent: { kind: "BOOKING", id: edge.booking_id as string },
            child: { kind: "ENTITLEMENT", id: edge.entitlement_id as string },
            active: edge.active as boolean,
          });
        }
  }
  const key = (value: unknown) => JSON.stringify(value);
  const order = (a: unknown, b: unknown) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  return coreHashValue(
    "otr-trip-core-lifecycle-graph-v2",
    { roots: [...roots.values()].sort(order), edges: edges.sort(order) },
    hash,
  );
}
