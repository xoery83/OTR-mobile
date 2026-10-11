import { z } from "zod";
import * as f from "./tripCoreV2";
import { emptyCoreGraph, type CoreGraph, type CoreRow } from "./tripCoreV2Mutation";
import { coreMirrorKey, validateCoreGraph } from "./tripCoreV2Graph";
import { canonicalEventJson, type Json } from "./eventIntentJson";
import type { ImportHash } from "./flightImportReview";
const kinds = [
  "ITEM",
  "BOOKING",
  "ENTITLEMENT",
  "DOCUMENT",
  "INSTRUCTION",
  "RELATION",
  "PERSON_BINDING",
] as const;
const kindSchema = z.enum(kinds);
const itemChildren = {
  itinerary_transport_endpoints: true,
  trip_endpoint_details: true,
  trip_flight_intents: true,
  itinerary_transport_services: true,
  trip_stay_details: true,
  trip_stay_rooms: true,
  trip_rental_details: true,
  trip_rental_places: true,
  trip_activity_details: true,
  trip_activity_entry_places: true,
  trip_transport_operational_facts: true,
} as const;
const itemShape = Object.fromEntries(
  Object.keys(itemChildren).map((table) => [
    table,
    z.array(f.coreTableSchemas[table as f.CoreTable]).max(64),
  ]),
);
const itemBody = f.itinerary_eventsSchema.extend(itemShape);
const bookingBody = f.itinerary_reservationsSchema.extend({
  trip_booking_observations: z.array(f.trip_booking_observationsSchema).max(64),
});
const relations = Object.keys(f.coreTableSchemas).filter(
  (t) =>
    !Object.values(f.coreKindTables).includes(t as never) &&
    !Object.hasOwn(itemChildren, t) &&
    t !== "trip_booking_observations",
) as f.CoreTable[];
const relationBodies = z.union(
  relations.map((table) =>
    z.strictObject({ tableName: z.literal(table), row: f.coreTableSchemas[table] }),
  ) as unknown as [z.ZodType, ...z.ZodType[]],
);
export const corePersonBindingSchema = z.strictObject({
  person_id: f.coreUuid,
  account_id: f.coreUuid.nullable(),
  active: z.boolean(),
});
export const coreReadRecordSchema = z
  .strictObject({
    kind: kindSchema,
    id: f.coreText(256),
    revision: f.coreRevision,
    body: z.unknown(),
  })
  .superRefine((r, c) => {
    const schema =
      r.kind === "ITEM"
        ? itemBody
        : r.kind === "BOOKING"
          ? bookingBody
          : r.kind === "ENTITLEMENT"
            ? f.trip_entitlementsSchema
            : r.kind === "DOCUMENT"
              ? f.trip_operational_documentsSchema
              : r.kind === "INSTRUCTION"
                ? f.trip_instruction_entriesSchema
                : r.kind === "PERSON_BINDING"
                  ? corePersonBindingSchema
                  : relationBodies;
    if (!schema.safeParse(r.body).success)
      c.addIssue({ code: "custom", message: "INVALID_READ_RECORD" });
  });
export type CoreReadRecord = z.infer<typeof coreReadRecordSchema>;
const scope = {
  readVersion: z.literal(2),
  actorAccountId: f.coreUuid,
  tripId: f.coreUuid,
  epoch: f.coreUuid,
  revision: f.coreRevision,
  accessRevision: f.coreRevision,
};
export const coreReadPageSchema = z.strictObject({
  ...scope,
  pageIndex: z.number().int().min(0).max(99),
  records: z.array(coreReadRecordSchema).max(20000),
  pageSha256: f.coreHash,
});
export const coreReadManifestSchema = z.strictObject({
  ...scope,
  projectionVersion: z.literal(2),
  actorPersonBindingHash: f.coreHash,
  participatingRosterHash: f.coreHash,
  generatedAt: z.string().datetime({ precision: undefined }),
  complete: z.literal(true),
  rosters: z
    .array(
      z.strictObject({
        kind: kindSchema,
        count: z.number().int().min(0).max(20000),
        sha256: f.coreHash,
      }),
    )
    .length(7),
  pages: z
    .array(
      z.strictObject({
        pageIndex: z.number().int().min(0).max(99),
        byteCount: z.number().int().min(0).max(4194304),
        sha256: f.coreHash,
      }),
    )
    .min(1)
    .max(100),
  manifestSha256: f.coreHash,
});
export type CoreReadManifest = z.infer<typeof coreReadManifestSchema>;
export type CoreReadPage = z.infer<typeof coreReadPageSchema>;
export const coreHashValue = async (domain: string, body: unknown, hash: ImportHash) =>
  hash(new TextEncoder().encode(domain + "\n" + canonicalEventJson(body as Json)));
const byteCount = (v: unknown) =>
  new TextEncoder().encode(canonicalEventJson(v as Json)).length;
const recordOrder = (a: CoreReadRecord, b: CoreReadRecord) =>
  a.kind + ":" + a.id < b.kind + ":" + b.id
    ? -1
    : a.kind + ":" + a.id > b.kind + ":" + b.id
      ? 1
      : 0;
export async function makeCoreReadCollection(
  records: CoreReadRecord[],
  header: Omit<
    CoreReadManifest,
    | "readVersion"
    | "projectionVersion"
    | "complete"
    | "rosters"
    | "pages"
    | "manifestSha256"
  >,
  hash: ImportHash,
) {
  records = records.map((r) => coreReadRecordSchema.parse(r)).sort(recordOrder);
  if (
    new Set(records.map((r) => r.kind + ":" + r.id)).size !== records.length ||
    records.filter((r) => !["RELATION", "PERSON_BINDING"].includes(r.kind)).length > 10000
  )
    throw new Error("COLLECTION_TOO_LARGE");
  const roster = [];
  for (const kind of kinds) {
    const rows = records.filter((r) => r.kind === kind);
    const entries = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        revision: r.revision,
        sha256: await coreHashValue("otr-trip-core-object-v2", r, hash),
      })),
    );
    roster.push({
      kind,
      count: rows.length,
      sha256: await coreHashValue("otr-trip-core-roster-v2", entries, hash),
    });
  }
  const pages: CoreReadPage[] = [];
  let current: CoreReadRecord[] = [];
  const flush = async () => {
    const unsigned = {
      readVersion: 2 as const,
      actorAccountId: header.actorAccountId,
      tripId: header.tripId,
      epoch: header.epoch,
      revision: header.revision,
      accessRevision: header.accessRevision,
      pageIndex: pages.length,
      records: current,
    };
    pages.push({
      ...unsigned,
      pageSha256: await coreHashValue("otr-trip-core-page-v2", unsigned, hash),
    });
    current = [];
  };
  for (const r of records) {
    if (byteCount(r) > 262144) throw new Error("COLLECTION_TOO_LARGE");
    if (byteCount([...current, r]) > 4000000 && current.length) await flush();
    current.push(r);
  }
  await flush();
  if (pages.length > 100 || pages.reduce((n, p) => n + byteCount(p), 0) > 67108864)
    throw new Error("COLLECTION_TOO_LARGE");
  const unsigned = {
    ...header,
    readVersion: 2 as const,
    projectionVersion: 2 as const,
    complete: true as const,
    rosters: roster,
    pages: pages.map((p) => ({
      pageIndex: p.pageIndex,
      byteCount: byteCount(p),
      sha256: p.pageSha256,
    })),
  };
  return {
    manifest: coreReadManifestSchema.parse({
      ...unsigned,
      manifestSha256: await coreHashValue("otr-trip-core-manifest-v2", unsigned, hash),
    }),
    pages,
  };
}
export async function validateCoreReadCollection(
  manifestInput: unknown,
  pageInputs: unknown[],
  accountId: string,
  tripId: string,
  hash: ImportHash,
): Promise<{
  manifest: CoreReadManifest;
  graph: CoreGraph;
  records: CoreReadRecord[];
  bindings: z.infer<typeof corePersonBindingSchema>[];
}> {
  const manifest = coreReadManifestSchema.parse(manifestInput),
    pages = pageInputs.map((p) => coreReadPageSchema.parse(p));
  if (manifest.actorAccountId !== accountId || manifest.tripId !== tripId)
    throw new Error("CORE_READ_SCOPE_MISMATCH");
  const { manifestSha256, ...unsignedManifest } = manifest;
  if (
    (await coreHashValue("otr-trip-core-manifest-v2", unsignedManifest, hash)) !==
    manifestSha256
  )
    throw new Error("CORE_READ_HASH_MISMATCH");
  if (
    pages.length !== manifest.pages.length ||
    new Set(pages.map((p) => p.pageIndex)).size !== pages.length
  )
    throw new Error("CORE_READ_INCOMPLETE");
  pages.sort((a, b) => a.pageIndex - b.pageIndex);
  const records: CoreReadRecord[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i],
      m = manifest.pages[i],
      { pageSha256, ...unsigned } = p;
    if (
      m.pageIndex !== i ||
      p.pageIndex !== i ||
      p.actorAccountId !== accountId ||
      p.tripId !== tripId ||
      p.epoch !== manifest.epoch ||
      p.revision !== manifest.revision ||
      p.accessRevision !== manifest.accessRevision
    )
      throw new Error("CORE_READ_SNAPSHOT_MISMATCH");
    if (
      m.byteCount !== byteCount(p) ||
      m.sha256 !== pageSha256 ||
      (await coreHashValue("otr-trip-core-page-v2", unsigned, hash)) !== pageSha256
    )
      throw new Error("CORE_READ_HASH_MISMATCH");
    records.push(...p.records);
  }
  const rebuilt = await makeCoreReadCollection(
    records,
    {
      actorAccountId: accountId,
      tripId,
      epoch: manifest.epoch,
      revision: manifest.revision,
      accessRevision: manifest.accessRevision,
      actorPersonBindingHash: manifest.actorPersonBindingHash,
      participatingRosterHash: manifest.participatingRosterHash,
      generatedAt: manifest.generatedAt,
    },
    hash,
  );
  if (
    canonicalEventJson(rebuilt.manifest.rosters as Json) !==
      canonicalEventJson(manifest.rosters as Json) ||
    new Set(manifest.rosters.map((r) => r.kind)).size !== 7 ||
    records.some((r, i) => i > 0 && recordOrder(records[i - 1], r) >= 0)
  )
    throw new Error("CORE_READ_ROSTER_MISMATCH");
  const graph = emptyCoreGraph(),
    bindings: z.infer<typeof corePersonBindingSchema>[] = [];
  for (const r of records) {
    const body = r.body as CoreRow;
    if (r.kind === "RELATION") {
      const table = body.tableName as f.CoreTable,
        row = body.row as CoreRow;
      if (
        r.id !==
        table + ":" + Object.values(JSON.parse(coreMirrorKey(table, row))).join(":")
      )
        throw new Error("CORE_READ_ID_MISMATCH");
      graph[table].push(row);
    } else if (r.kind === "PERSON_BINDING") {
      const binding = corePersonBindingSchema.parse(body);
      if (r.id !== binding.person_id) throw new Error("CORE_READ_ID_MISMATCH");
      bindings.push(binding);
    } else {
      const table = f.coreKindTables[r.kind];
      const childTables =
        r.kind === "ITEM"
          ? Object.keys(itemChildren)
          : r.kind === "BOOKING"
            ? ["trip_booking_observations"]
            : [];
      const root = { ...body };
      for (const child of childTables) {
        delete root[child];
        const rows = body[child] as CoreRow[];
        if (rows.some((x) => x[r.kind === "ITEM" ? "event_id" : "booking_id"] !== r.id))
          throw new Error("CORE_READ_CHILD_MISMATCH");
        graph[child as f.CoreTable].push(...rows);
      }
      if (
        root.id !== r.id ||
        root[r.kind === "ITEM" ? "semantic_revision" : "revision"] !== r.revision
      )
        throw new Error("CORE_READ_ID_MISMATCH");
      graph[table].push(root);
    }
  }
  validateCoreGraph(graph, tripId);
  if (
    (await coreHashValue(
      "otr-trip-core-person-bindings-v2",
      bindings.filter((b) => b.account_id === accountId),
      hash,
    )) !== manifest.actorPersonBindingHash ||
    (await coreHashValue(
      "otr-trip-core-participating-roster-v2",
      bindings.filter((b) => b.active).map((b) => b.person_id),
      hash,
    )) !== manifest.participatingRosterHash
  )
    throw new Error("CORE_READ_BINDING_MISMATCH");
  return { manifest, graph, records, bindings };
}
export const coreReadItemChildren = Object.keys(itemChildren) as f.CoreTable[];
export const coreReadRelationTables = relations;
