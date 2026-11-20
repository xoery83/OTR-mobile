import { createHash } from "node:crypto";
import { z } from "zod";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  ledgerAuditEventSchema,
  ledgerBootstrapResponseSchema,
  ledgerExpenseSchema,
  ledgerExpenseListResponseSchema,
} from "../../src/data/api/ledgerReadContracts";
import {
  finalizedSettlementSchema,
  personalSettlementPaymentSchema,
  settlementPaymentSchema,
} from "../../src/data/api/ledgerSettlementContracts";
import { personalPaymentAuditEventSchema } from "../../src/data/api/personalPaymentAuditContracts";
import type { DevBackendGateway } from "./app";

const limit = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().max(100));
const history = z.strictObject({
  cursor: z.string().min(1).max(2048).optional(),
  limit: limit.default(50),
});
const list = history.extend({
  includeHistory: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default(false),
});
const expenseListQuery = history
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    includeDeleted: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .default(false),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to);
const historyQuery = history.extend({
  targetKind: z.enum(["EXPENSE", "SETTLEMENT", "PERSONAL_PAYMENT"]),
  targetId: coreUuid,
});
const exportQuery = history
  .extend({
    limit: limit.default(100),
    scope: z.enum(["EXPENSES", "SETTLEMENT", "PERSONAL_PAYMENTS"]),
    format: z.literal("JSON"),
    targetId: coreUuid.optional(),
  })
  .refine((q) => q.scope !== "SETTLEMENT" || q.targetId !== undefined);
const cursorSchema = z.strictObject({
  snapshot: coreHash,
  offset: z.number().int().nonnegative().safe(),
});
const pageSchema = z.strictObject({
  snapshot: coreHash,
  nextCursor: z.string().nullable(),
});
export const settlementPageSchema = pageSchema.extend({
  tripId: coreUuid,
  items: z.array(finalizedSettlementSchema),
});
export const settlementHistoryPageSchema = pageSchema.extend({
  rootSettlementId: coreUuid,
  items: z.array(finalizedSettlementSchema),
});
export const settlementPaymentPageSchema = pageSchema.extend({
  settlementId: coreUuid,
  items: z.array(settlementPaymentSchema),
});
export const ledgerHistoryPageSchema = z.discriminatedUnion("targetKind", [
  pageSchema.extend({
    targetKind: z.literal("EXPENSE"),
    targetId: coreUuid,
    events: z.array(ledgerAuditEventSchema).max(100),
  }),
  pageSchema.extend({
    targetKind: z.literal("SETTLEMENT"),
    targetId: coreUuid,
    events: finalizedSettlementSchema.shape.auditEvents.max(100),
  }),
  pageSchema.extend({
    targetKind: z.literal("PERSONAL_PAYMENT"),
    targetId: coreUuid,
    events: z.array(personalPaymentAuditEventSchema).max(100),
  }),
]);
export const ledgerExportSchema = z.discriminatedUnion("scope", [
  pageSchema.extend({
    format: z.literal("JSON"),
    schemaVersion: z.literal("otr.ledger.export/1"),
    tripId: coreUuid,
    scope: z.literal("EXPENSES"),
    rows: z.array(ledgerExpenseSchema),
  }),
  pageSchema.extend({
    format: z.literal("JSON"),
    schemaVersion: z.literal("otr.ledger.export/1"),
    tripId: coreUuid,
    scope: z.literal("SETTLEMENT"),
    rows: z.array(finalizedSettlementSchema),
  }),
  pageSchema.extend({
    format: z.literal("JSON"),
    schemaVersion: z.literal("otr.ledger.export/1"),
    tripId: coreUuid,
    scope: z.literal("PERSONAL_PAYMENTS"),
    rows: z.array(personalSettlementPaymentSchema),
  }),
]);
export function isLedgerBetaReadPath(path: string, query?: URLSearchParams) {
  // Existing Native reporting filters remain on their owning reporting reader.
  if (
    /\/expenses$/.test(path) &&
    query &&
    ([...query.keys()].some((key) =>
      [
        "query",
        "category",
        "payerMemberId",
        "participantMemberId",
        "currency",
        "businessStatus",
        "syncStatus",
        "conflict",
        "valuation",
        "receipt",
      ].includes(key),
    ) ||
      [query.get("from"), query.get("to")].some((value) => value?.includes("T")))
  )
    return false;
  return /^\/v2\/trips\/[^/]+\/(?:expenses(?:\/[^/]+)?|settlements(?:\/[^/]+(?:\/(?:history|payments))?)?|ledger\/(?:history|export))$/.test(
    path,
  );
}
function paginate<T>(
  rows: readonly T[],
  actor: string,
  trip: string,
  resource: string,
  query: { cursor?: string; limit: number },
) {
  const { cursor, ...filters } = query;
  const snapshot = createHash("sha256")
    .update(
      canonicalCoreJson(
        JSON.parse(JSON.stringify({ actor, trip, resource, filters, rows })) as Json,
      ),
    )
    .digest("hex");
  let offset = 0;
  if (cursor) {
    let parsed: z.infer<typeof cursorSchema>;
    try {
      parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new Error("INVALID_CURSOR");
    }
    if (parsed.snapshot !== snapshot) throw new Error("STALE_CURSOR");
    offset = parsed.offset;
  }
  return {
    rows: rows.slice(offset, offset + query.limit),
    snapshot,
    nextCursor:
      offset + query.limit < rows.length
        ? Buffer.from(
            JSON.stringify({ snapshot, offset: offset + query.limit }),
          ).toString("base64url")
        : null,
  };
}
export async function ledgerBetaReadBoundary(
  request: Request,
  actor: string,
  gateway: Pick<
    DevBackendGateway,
    "canReadTrip" | "bootstrapLedger" | "readPersonalPaymentAudit"
  >,
) {
  const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
          Vary: "Authorization",
        },
      }),
    fail = (status: number, code: string) =>
      reply(status, { error: { code, message: code } });
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    request.body !== null ||
    new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length
  )
    return fail(400, "INVALID_PAYLOAD");
  const [, trip, resource] = match,
    parts = resource.split("/"),
    raw = Object.fromEntries(url.searchParams);
  const schema =
    resource === "expenses"
      ? expenseListQuery
      : resource === "ledger/export"
        ? exportQuery
        : resource === "ledger/history"
          ? historyQuery
          : resource === "settlements"
            ? list
            : parts[2]
              ? history
              : z.strictObject({});
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(400, "INVALID_PAYLOAD");
  if (
    parts[1] &&
    !["history", "export"].includes(parts[1]) &&
    !coreUuid.safeParse(parts[1]).success
  )
    return fail(400, "INVALID_PAYLOAD");
  try {
    if (!(await gateway.canReadTrip(actor, trip))) return fail(403, "FORBIDDEN");
    const data = ledgerBootstrapResponseSchema.parse(
      await gateway.bootstrapLedger(actor, trip),
    );
    if (data.journey.id !== trip || data.actor.userId !== actor)
      throw new Error("RESULT_MISMATCH");
    if (!data.actor.capabilities.canRead) return fail(403, "FORBIDDEN");
    if (resource === "expenses") {
      const q = expenseListQuery.parse(raw);
      const rows = data.expenses
        .filter(
          (e) =>
            (q.includeDeleted ||
              (e.businessStatus !== "DELETED" && e.deletedAt === null)) &&
            (!q.from || e.occurredAt >= q.from + "T00:00:00.000Z") &&
            (!q.to || e.occurredAt < q.to + "T00:00:00.000Z"),
        )
        .sort(
          (a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id),
        );
      const page = paginate(rows, actor, trip, resource, q);
      return reply(
        200,
        ledgerExpenseListResponseSchema.parse({
          expenses: page.rows,
          nextCursor: page.nextCursor,
        }),
      );
    }
    if (parts[0] === "expenses") {
      const expense = data.expenses.find((e) => e.id === parts[1]);
      return expense
        ? reply(200, ledgerExpenseSchema.parse(expense))
        : fail(404, "NOT_VISIBLE");
    }
    if (parts[0] === "settlements") {
      let rows = [...(data.settlements ?? [])].sort(
        (a, b) => a.finalizedAt.localeCompare(b.finalizedAt) || a.id.localeCompare(b.id),
      );
      if (parts[1]) {
        const target = rows.find((s) => s.id === parts[1]);
        if (!target) return fail(404, "NOT_VISIBLE");
        if (!parts[2]) return reply(200, finalizedSettlementSchema.parse(target));
        if (parts[2] === "payments") {
          const values = target.transfers
              .flatMap((t) => t.payments)
              .sort((a, b) => a.id.localeCompare(b.id)),
            page = paginate(values, actor, trip, resource, history.parse(raw));
          return reply(
            200,
            settlementPaymentPageSchema.parse({
              settlementId: target.id,
              items: page.rows,
              snapshot: page.snapshot,
              nextCursor: page.nextCursor,
            }),
          );
        }
        const root = target.rootSettlementId ?? target.id;
        rows = rows.filter((s) => (s.rootSettlementId ?? s.id) === root);
        const page = paginate(rows, actor, trip, resource, history.parse(raw));
        return reply(
          200,
          settlementHistoryPageSchema.parse({
            rootSettlementId: root,
            items: page.rows,
            snapshot: page.snapshot,
            nextCursor: page.nextCursor,
          }),
        );
      }
      const q = list.parse(raw);
      if (!q.includeHistory)
        rows = rows.filter(
          (s) => s.status !== "SUPERSEDED" && s.id === (s.lineageHeadId ?? s.id),
        );
      const page = paginate(rows, actor, trip, resource, q);
      return reply(
        200,
        settlementPageSchema.parse({
          tripId: trip,
          items: page.rows,
          snapshot: page.snapshot,
          nextCursor: page.nextCursor,
        }),
      );
    }
    if (resource === "ledger/history") {
      const q = historyQuery.parse(raw);
      if (q.targetKind === "SETTLEMENT") {
        const target = data.settlements?.find((s) => s.id === q.targetId);
        if (!target) return fail(404, "NOT_VISIBLE");
        const page = paginate(
          [...target.auditEvents].sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          ),
          actor,
          trip,
          resource,
          q,
        );
        return reply(
          200,
          ledgerHistoryPageSchema.parse({
            targetKind: q.targetKind,
            targetId: q.targetId,
            events: page.rows,
            snapshot: page.snapshot,
            nextCursor: page.nextCursor,
          }),
        );
      }
      if (q.targetKind === "PERSONAL_PAYMENT") {
        if (!data.personalPayments?.some((p) => p.id === q.targetId))
          return fail(404, "NOT_VISIBLE");
        if (!gateway.readPersonalPaymentAudit) return fail(503, "CAPABILITY_UNAVAILABLE");
        const events = z
          .array(personalPaymentAuditEventSchema)
          .max(10000)
          .parse(await gateway.readPersonalPaymentAudit(actor, trip, q.targetId));
        if (events.some((e) => e.recordId !== q.targetId || e.journeyId !== trip))
          throw new Error("RESULT_MISMATCH");
        const page = paginate(
          events.sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          ),
          actor,
          trip,
          resource,
          q,
        );
        return reply(
          200,
          ledgerHistoryPageSchema.parse({
            targetKind: q.targetKind,
            targetId: q.targetId,
            events: page.rows,
            snapshot: page.snapshot,
            nextCursor: page.nextCursor,
          }),
        );
      }
      const expense = data.expenses.find((e) => e.id === q.targetId);
      if (!expense) return fail(404, "NOT_VISIBLE");
      const page = paginate(
        [...expense.auditEvents].sort(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
        actor,
        trip,
        resource,
        q,
      );
      return reply(
        200,
        ledgerHistoryPageSchema.parse({
          targetKind: q.targetKind,
          targetId: q.targetId,
          events: page.rows,
          snapshot: page.snapshot,
          nextCursor: page.nextCursor,
        }),
      );
    }
    const q = exportQuery.parse(raw);
    const values =
      q.scope === "EXPENSES"
        ? data.expenses
        : q.scope === "SETTLEMENT"
          ? (data.settlements ?? [])
          : (data.personalPayments ?? []);
    const rows = values
      .filter((row) => !q.targetId || row.id === q.targetId)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (q.targetId && !rows.length) return fail(404, "NOT_VISIBLE");
    const page = paginate(rows, actor, trip, resource, q);
    return reply(
      200,
      ledgerExportSchema.parse({
        format: "JSON",
        schemaVersion: "otr.ledger.export/1",
        tripId: trip,
        scope: q.scope,
        rows: page.rows,
        snapshot: page.snapshot,
        nextCursor: page.nextCursor,
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "STALE_CURSOR"
      ? fail(409, code)
      : code === "INVALID_CURSOR"
        ? fail(400, code)
        : fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
