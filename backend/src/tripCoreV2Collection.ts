import { projectOrdinaryOrder } from "../../src/domain/trip/tripCoreTtr";
import {
  coreCanRead,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreKindTables, type CoreKind } from "../../src/domain/trip/tripCoreV2";
import { coreMirrorKey } from "../../src/domain/trip/tripCoreV2Graph";
import {
  coreReadItemChildren,
  coreReadRelationTables,
  makeCoreReadCollection,
  coreHashValue,
  type CoreReadRecord,
} from "../../src/domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
export function coreActorReadRecords(
  graph: CoreGraph,
  actor: CoreActor,
  authorizedOriginalIds: readonly string[] = [],
  authorizedExpenseIds: readonly string[] = [],
  authorizedEvidenceRefs: readonly string[] = [],
  ordinaryOrderVersion?: 1,
): CoreReadRecord[] {
  const redact = (row: Record<string, unknown>) => {
    const copy = structuredClone(row);
    for (const [key, value] of Object.entries(copy)) {
      if (key === "field_state" && value && typeof value === "object")
        for (const meta of Object.values(
          value as Record<string, Record<string, unknown>>,
        ))
          if (
            typeof meta.evidence_ref === "string" &&
            !authorizedEvidenceRefs.includes(meta.evidence_ref)
          )
            meta.evidence_ref = null;
      if (
        (key === "evidence_ref" || key === "source_representation_id") &&
        typeof value === "string" &&
        !authorizedEvidenceRefs.includes(value)
      )
        copy[key] = null;
      if (
        key.endsWith("provenance_refs") &&
        value &&
        typeof value === "object" &&
        Object.values(value).some(
          (ref) => typeof ref !== "string" || !authorizedEvidenceRefs.includes(ref),
        )
      )
        copy[key] = null;
    }
    return copy;
  };
  const records: CoreReadRecord[] = [],
    visible = new Map<string, number>();
  for (const [kind, table] of Object.entries(coreKindTables))
    for (const row of graph[table]) {
      if (
        (kind === "ORDER" && ordinaryOrderVersion !== 1) ||
        !coreCanRead(graph, actor, kind as CoreKind, row) ||
        (kind === "DOCUMENT" && !authorizedOriginalIds.includes(row.id as string))
      )
        continue;
      const revision = row[kind === "ITEM" ? "semantic_revision" : "revision"] as number;
      const body =
        kind === "ORDER"
          ? projectOrdinaryOrder(graph, actor, row)
          : kind === "DOCUMENT"
            ? { ...row, field_state: redact(row).field_state }
            : redact(row);
      if (kind === "ITEM")
        for (const child of coreReadItemChildren)
          body[child] = graph[child]
            .filter((x) => x.event_id === row.id)
            .map(redact)
            .sort((a, b) =>
              coreMirrorKey(child, a) < coreMirrorKey(child, b)
                ? -1
                : coreMirrorKey(child, a) > coreMirrorKey(child, b)
                  ? 1
                  : 0,
            );
      if (kind === "BOOKING")
        body.trip_booking_observations = graph.trip_booking_observations
          .filter((x) => x.booking_id === row.id)
          .map(redact)
          .sort((a, b) =>
            String(a.observation_id).localeCompare(String(b.observation_id)),
          );
      records.push({ kind: kind as CoreKind, id: row.id as string, revision, body });
      visible.set(kind + ":" + row.id, revision);
    }
  const references = {
    event_id: "ITEM",
    item_id: "ITEM",
    booking_id: "BOOKING",
    entitlement_id: "ENTITLEMENT",
    document_id: "DOCUMENT",
    instruction_id: "INSTRUCTION",
  };
  for (const table of coreReadRelationTables)
    for (const row of graph[table]) {
      if (
        table === "expense_links" &&
        !authorizedExpenseIds.includes(row.expense_id as string)
      )
        continue;
      let revision: number | undefined;
      let permitted = true;
      for (const [field, kind] of Object.entries(references))
        if (row[field] !== undefined) {
          const parentRevision = visible.get(kind + ":" + row[field]);
          if (parentRevision === undefined) {
            permitted = false;
            break;
          }
          revision ??= parentRevision;
        }
      if (table === "expense_links") {
        const kind = {
          ITINERARY_EVENT: "ITEM",
          ITINERARY_RESERVATION: "BOOKING",
          DOCUMENT: "DOCUMENT",
        }[row.type as string];
        revision = visible.get(kind + ":" + row.target_id);
        permitted = !!revision;
      }
      if (!permitted || revision === undefined) continue;
      records.push({
        kind: "RELATION",
        id: table + ":" + (JSON.parse(coreMirrorKey(table, row)) as unknown[]).join(":"),
        revision,
        body: { tableName: table, row },
      });
    }
  return records;
}
export async function buildCoreActorCollection(
  graph: CoreGraph,
  actor: CoreActor,
  state: { epoch: string; revision: number; accessRevision: number; generatedAt: string },
  bindings: {
    person_id: string;
    account_id: string | null;
    active: boolean;
    participating: boolean;
    revision: number;
  }[],
  hash: ImportHash,
  authorizedOriginalIds: readonly string[] = [],
  authorizedExpenseIds: readonly string[] = [],
  authorizedEvidenceRefs: readonly string[] = [],
  ordinaryOrderVersion?: 1,
) {
  if (!actor.active) throw new Error("NOT_VISIBLE");
  const records = coreActorReadRecords(
    graph,
    actor,
    authorizedOriginalIds,
    authorizedExpenseIds,
    authorizedEvidenceRefs,
    ordinaryOrderVersion,
  );
  const sorted = [...bindings].sort((a, b) => a.person_id.localeCompare(b.person_id));
  for (const { revision, ...body } of sorted)
    records.push({ kind: "PERSON_BINDING", id: body.person_id, revision, body });
  const bodies = sorted.map(({ revision: _, ...body }) => body);
  return makeCoreReadCollection(
    records,
    {
      ...state,
      ...(ordinaryOrderVersion === 1 ? { ordinaryOrderVersion: 1 as const } : {}),
      actorAccountId: actor.accountId,
      tripId: actor.tripId,
      actorPersonBindingHash: await coreHashValue(
        "otr-trip-core-person-bindings-v2",
        bodies.filter((b) => b.account_id === actor.accountId),
        hash,
      ),
      participatingRosterHash: await coreHashValue(
        "otr-trip-core-participating-roster-v2",
        bodies.filter((b) => b.active && b.participating).map((b) => b.person_id),
        hash,
      ),
    },
    hash,
  );
}
