import { z } from "zod";
import { itemLifecycleBaseSchema } from "../../src/domain/trip/tripLifecycleContract";
import { itemEditBaseOutput } from "../../mcp/contract";
import {
  coreReadRecordSchema,
  coreReadItemChildren,
  coreHashValue,
  type CoreReadManifest,
  type CoreReadPage,
} from "../../src/domain/trip/tripCoreV2Read";
import { coreUuid, coreText, type CoreTable } from "../../src/domain/trip/tripCoreV2";
import {
  coreCanManage,
  type CoreActor,
  type CoreGraph,
  type CoreRow,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreMirrorKey } from "../../src/domain/trip/tripCoreV2Graph";
import {
  projectCoreItem,
  type CoreSupplementalAuthority,
} from "../../src/domain/trip/tripCoreV2Views";
import { validateCalendarDate } from "../../src/domain/trip/dayReadModel";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { itemSearchText } from "./itemSearchText";

const familySchema = z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]);
const coverageSchema = z.enum([
  "COMPLETE_AUTHORIZED",
  "REDACTED_OR_PARTIAL",
  "UNAVAILABLE",
]);
const relation = (table: string) =>
  z
    .array(coreReadRecordSchema)
    .refine((rows) =>
      rows.every(
        (r) =>
          r.kind === "RELATION" && (r.body as { tableName: string }).tableName === table,
      ),
    );
export const tripItemSnapshotSchema = itemEditBaseOutput
  .extend({
    actorAccountId: coreUuid,
    relations: z.strictObject({
      participation: relation("trip_item_participants"),
      visibility: relation("trip_item_visibility_people"),
      expenseLinks: relation("expense_links"),
    }),
    coverage: z.strictObject({
      root: coverageSchema,
      children: z.strictObject(
        Object.fromEntries(
          coreReadItemChildren.map((t) => [t, coverageSchema]),
        ) as Record<(typeof coreReadItemChildren)[number], typeof coverageSchema>,
      ),
      relations: z.strictObject({
        participation: coverageSchema,
        visibility: coverageSchema,
        expenseLinks: coverageSchema,
      }),
      fieldAvailability: z.array(
        z.strictObject({
          path: z.string(),
          state: z.enum(["READABLE", "REDACTED", "UNAVAILABLE"]),
        }),
      ),
    }),
  })
  .strict();
const date = z.string().refine((value) => {
  try {
    return validateCalendarDate(value) === value;
  } catch {
    return false;
  }
});
const flag = z.enum(["true", "false"]).transform((v) => v === "true");
export const tripItemListQuerySchema = z
  .strictObject({
    family: familySchema,
    dateFrom: date.optional(),
    dateTo: date.optional(),
    cursor: z.string().max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(25).default(20),
    includeHidden: flag.default(false),
    query: coreText(200)
      .transform((v) => v.trim())
      .refine((v) => v.length > 0)
      .optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo);
export type TripItemListQuery = z.infer<typeof tripItemListQuerySchema>;
type Collection = { manifest: CoreReadManifest; pages: CoreReadPage[] };
const cursorSchema = z.strictObject({
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  after: coreUuid,
});
export const tripItemPageSchema = z
  .strictObject({
    version: z.literal("otr.items.read/1"),
    tripId: coreUuid,
    family: familySchema,
    items: z
      .array(
        z.strictObject({
          itemId: coreUuid,
          family: familySchema,
          title: z.string(),
          revision: z.number().int().positive().safe(),
          localDates: z.array(date),
          hidden: z.boolean(),
        }),
      )
      .max(25),
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
    nextCursor: z.string().max(2048).nullable(),
  })
  .refine((page) => page.items.every((item) => item.family === page.family));
const localDates = (row: CoreRow, graph: CoreGraph) =>
  [
    ...new Set(
      [
        row.start_local_date,
        row.end_local_date,
        ...graph.itinerary_transport_endpoints
          .filter((e) => e.event_id === row.id)
          .map((e) => e.local_date),
      ].filter((d): d is string => typeof d === "string"),
    ),
  ].sort();
export async function buildTripItemPage(
  graph: CoreGraph,
  actor: CoreActor,
  collection: Collection,
  deletedIds: ReadonlySet<string>,
  query: TripItemListQuery,
  hash: ImportHash,
) {
  const { cursor, ...filters } = query;
  const snapshot = await coreHashValue(
    "otr.items.read/1",
    {
      actor: actor.accountId,
      trip: actor.tripId,
      filters,
      epoch: collection.manifest.epoch,
      revision: collection.manifest.revision,
      accessRevision: collection.manifest.accessRevision,
      rosters: collection.manifest.rosters,
    },
    hash,
  );
  let after = "";
  if (cursor) {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("INVALID_PAYLOAD");
    let parsed;
    try {
      parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new Error("INVALID_PAYLOAD");
    }
    if (parsed.snapshot !== snapshot) throw new Error("STALE_CURSOR");
    after = parsed.after;
  }
  const visibleIds = new Set(
    collection.pages
      .flatMap((p) => p.records)
      .filter((r) => r.kind === "ITEM")
      .map((r) => r.id),
  );
  const needle = query.query ? itemSearchText(query.query) : null;
  const rows = graph.itinerary_events
    .filter((row) => {
      if (
        !visibleIds.has(row.id as string) ||
        row.experience_family !== query.family ||
        String(row.id) <= after
      )
        return false;
      const deleted = deletedIds.has(row.id as string);
      if (deleted) return false;
      if (row.hidden_at !== null && !query.includeHidden && !deleted) return false;
      const dates = localDates(row, graph);
      if (
        (query.dateFrom || query.dateTo) &&
        (!dates.length ||
          dates[0] > (query.dateTo ?? query.dateFrom!) ||
          dates.at(-1)! < (query.dateFrom ?? dates[0]))
      )
        return false;
      if (!needle) return true;
      const facts: unknown[] = [row.title, row.description];
      for (const record of [
        row,
        ...coreReadItemChildren.flatMap((t) =>
          graph[t].filter((r) => r.event_id === row.id),
        ),
      ])
        for (const [key, value] of Object.entries(record))
          if (
            key.startsWith("authored_") ||
            key.startsWith("accepted_address") ||
            key === "property_name"
          )
            facts.push(value);
      return facts.some(
        (value) => typeof value === "string" && itemSearchText(value).includes(needle),
      );
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const page = rows.slice(0, query.limit);
  return {
    version: "otr.items.read/1" as const,
    tripId: actor.tripId,
    family: query.family,
    items: page.map((row) => ({
      itemId: row.id as string,
      family: query.family,
      title: row.title as string,
      revision: row.semantic_revision as number,
      localDates: localDates(row, graph),
      hidden: row.hidden_at !== null,
    })),
    snapshot,
    nextCursor:
      rows.length > page.length
        ? Buffer.from(JSON.stringify({ snapshot, after: page.at(-1)!.id })).toString(
            "base64url",
          )
        : null,
  };
}
export function buildTripItemSnapshot(
  graph: CoreGraph,
  actor: CoreActor,
  collection: Collection,
  itemId: string,
  rights: CoreSupplementalAuthority,
  expenseLinksLoaded: boolean,
  deleted = false,
) {
  const records = collection.pages.flatMap((page) => page.records),
    record = records.find((r) => r.kind === "ITEM" && r.id === itemId);
  const root = graph.itinerary_events.find((row) => row.id === itemId);
  if (!root || !record || (deleted && !coreCanManage(graph, actor, "ITEM", root)))
    throw new Error("NOT_VISIBLE");
  const dto = projectCoreItem(graph, actor, itemId, rights);
  if (!dto) throw new Error("NOT_VISIBLE");
  const fieldAvailability: {
    path: string;
    state: "READABLE" | "REDACTED" | "UNAVAILABLE";
  }[] = [];
  const pointer = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");
  function walk(original: unknown, visible: unknown, path: string): boolean {
    if (original !== null && typeof original === "object") {
      let redacted = false;
      for (const [key, value] of Object.entries(original))
        redacted =
          walk(
            value,
            (visible as Record<string, unknown> | null)?.[key],
            path + "/" + pointer(key),
          ) || redacted;
      return redacted;
    }
    const state =
      visible === undefined
        ? "UNAVAILABLE"
        : Object.is(original, visible)
          ? "READABLE"
          : "REDACTED";
    fieldAvailability.push({ path, state });
    return state !== "READABLE";
  }
  const body = record.body as CoreRow;
  const rootCoverage = walk(root, body, "/record/body")
    ? "REDACTED_OR_PARTIAL"
    : "COMPLETE_AUTHORIZED";
  const children = Object.fromEntries(
    coreReadItemChildren.map((table) => {
      const raw = graph[table]
        .filter((r) => r.event_id === itemId)
        .sort((a, b) =>
          coreMirrorKey(table, a) < coreMirrorKey(table, b)
            ? -1
            : coreMirrorKey(table, a) > coreMirrorKey(table, b)
              ? 1
              : 0,
        );
      return [
        table,
        walk(raw, body[table], "/record/body/" + table)
          ? "REDACTED_OR_PARTIAL"
          : "COMPLETE_AUTHORIZED",
      ];
    }),
  );
  const groups = {
    participation: "trip_item_participants",
    visibility: "trip_item_visibility_people",
    expenseLinks: "expense_links",
  } as const;
  const relations: Record<string, typeof records> = {},
    relationCoverage: Record<string, z.infer<typeof coverageSchema>> = {};
  for (const [name, table] of Object.entries(groups)) {
    relations[name] = records.filter(
      (r) =>
        r.kind === "RELATION" &&
        (r.body as { tableName: string }).tableName === table &&
        (r.body as { row: CoreRow }).row[
          table === "expense_links" ? "target_id" : "item_id"
        ] === itemId,
    );
    const raw = graph[table as CoreTable].filter((r) =>
      table === "expense_links"
        ? r.type === "ITINERARY_EVENT" && r.target_id === itemId
        : r.item_id === itemId,
    );
    relationCoverage[name] =
      name === "expenseLinks" && !expenseLinksLoaded
        ? "UNAVAILABLE"
        : raw.length !== relations[name].length
          ? "REDACTED_OR_PARTIAL"
          : "COMPLETE_AUTHORIZED";
  }
  return tripItemSnapshotSchema.parse({
    version: "otr.mcp.edit-base/1",
    state: "SERVER_CONFIRMED",
    actorAccountId: actor.accountId,
    item: {
      ...dto,
      description: body.description,
      ...(["P1", "P6"].includes(dto.family) && body.activity_category !== null
        ? { details: { ...dto.details, category: body.activity_category } }
        : {}),
    },
    record,
    relations,
    basis: {
      epoch: collection.manifest.epoch,
      revision: collection.manifest.revision,
      access_revision: collection.manifest.accessRevision,
      manifest_sha256: collection.manifest.manifestSha256,
    },
    evidence_visibility: "BACKEND_AUTHORIZED_REDACTED_NOT_PROOF_OF_ABSENCE",
    coverage: {
      root: rootCoverage,
      children,
      relations: relationCoverage,
      fieldAvailability,
    },
  });
}

export async function tripItemsBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  read?: {
    items?(actor: string, trip: string, query: TripItemListQuery): Promise<unknown>;
    itemSnapshot?(actor: string, trip: string, item: string): Promise<unknown>;
    itemLifecycle?(
      actor: string,
      trip: string,
      item: string,
      family: string,
    ): Promise<unknown>;
  },
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/items(?:\/([^/]+)(\/lifecycle)?)?$/.exec(
      url.pathname,
    );
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    (match[2] && !coreUuid.safeParse(match[2]).success) ||
    request.body !== null
  )
    return fail(400, "INVALID_PAYLOAD");
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || (match[2] && !match[3] && keys.length))
    return fail(400, "INVALID_PAYLOAD");
  if (
    match[3] &&
    (keys.length !== 1 ||
      keys[0] !== "family" ||
      !/^P[1-6]$/.test(url.searchParams.get("family") ?? ""))
  )
    return fail(400, "INVALID_PAYLOAD");
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))
    return fail(400, "INVALID_PAYLOAD");
  const query = match[2]
    ? null
    : tripItemListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (query && !query.success) return fail(400, "INVALID_PAYLOAD");
  try {
    if (!(await canReadTrip(actor, match[1]))) return fail(403, "FORBIDDEN");
    if (match[3]) {
      if (!read?.itemLifecycle) return fail(503, "CAPABILITY_UNAVAILABLE");
      const result = itemLifecycleBaseSchema.parse(
        await read.itemLifecycle(
          actor,
          match[1],
          match[2],
          url.searchParams.get("family")!,
        ),
      );
      if (
        result.actorAccountId !== actor ||
        result.tripId !== match[1] ||
        result.itemId !== match[2] ||
        result.family !== url.searchParams.get("family")
      )
        return fail(503, "RESULT_MISMATCH");
      return reply(200, result);
    }
    if (match[2]) {
      if (!read?.itemSnapshot) return fail(503, "CAPABILITY_UNAVAILABLE");
      const result = tripItemSnapshotSchema.parse(
        await read.itemSnapshot(actor, match[1], match[2]),
      );
      if (
        result.actorAccountId !== actor ||
        result.item.tripId !== match[1] ||
        result.item.itemId !== match[2] ||
        result.record.id !== match[2] ||
        result.record.revision !== result.item.itemRevision
      )
        return fail(503, "RESULT_MISMATCH");
      return reply(200, result);
    }
    if (!read?.items || !query?.success) return fail(503, "CAPABILITY_UNAVAILABLE");
    const result = tripItemPageSchema.parse(
      await read.items(actor, match[1], query.data),
    );
    if (result.tripId !== match[1] || result.family !== query.data.family)
      return fail(503, "RESULT_MISMATCH");
    return reply(200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "NOT_VISIBLE"
      ? fail(404, "NOT_VISIBLE")
      : code === "STALE_CURSOR"
        ? fail(409, code)
        : code === "INVALID_PAYLOAD"
          ? fail(400, code)
          : fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
