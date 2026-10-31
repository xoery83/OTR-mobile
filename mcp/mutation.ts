import { itemSchema } from "./contract";
import type { BackendRead } from "./read";
import { createHash } from "node:crypto";
import { z } from "zod";
import { coreDateBoundary } from "../src/domain/trip/tripCoreV2Temporal";
import { coreDefaults, corePlaceSchema } from "../src/domain/trip/tripCoreV2";
import {
  validateCoreCommand,
  type CoreCommand,
} from "../src/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../src/domain/trip/tripCoreV2Read";
import { structuredTripCreateRequestSchema } from "../src/domain/trip/tripStructuredDestinationContract";
import {
  tripCreateWireResultSchema,
  type TripCreateWireRequest,
} from "../src/domain/trip/tripCreateWireContract";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import {
  createItemInput,
  updateItemInput,
  createTripInput,
  operationInput,
  type MutationResult,
} from "./mutationContract";
export type BackendMutation = (
  request: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
  signal: AbortSignal,
) => Promise<Response>;
export type ApprovalRequest = Readonly<{
  accountId: string;
  clientId: string;
  resource: string;
  digest: string;
  summary: string;
  operationIds: readonly string[];
}>;
// Trusted host user interaction only. Never bind this to a model-supplied boolean.
export type ConfirmChanges = (
  request: ApprovalRequest,
  signal: AbortSignal,
) => Promise<boolean>;
export const sha = (x: string | Uint8Array) =>
  createHash("sha256").update(x).digest("hex");
export const contentDigest = (value: unknown) => sha(canonicalCoreJson(value as Json));
function targetId(...parts: string[]) {
  const s = sha(parts.join("\n"));
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
export type PreparedMutation =
  | { kind: "ITEM"; command: CoreCommand; summary: string }
  | { kind: "TRIP"; command: TripCreateWireRequest; summary: string };
export function prepareCreate(account: string, raw: unknown): PreparedMutation {
  const q = createItemInput.parse(raw),
    i = q.item;
  const place = i.place
    ? {
        ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
        authored_label: i.place,
      }
    : undefined;
  const command = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: q.request_id,
    tripId: q.trip_id,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: targetId(account, q.trip_id, q.request_id) },
    baseVector: [
      { kind: "ITEM", id: targetId(account, q.trip_id, q.request_id), revision: null },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      ...coreDefaults("member"),
      family: i.family,
      core: {
        title: i.title,
        ...(i.notes !== undefined ? { description: i.notes } : {}),
      },
      schedule: {
        start: coreDateBoundary(i.dates.start_date),
        ...(i.dates.end_date ? { end: coreDateBoundary(i.dates.end_date) } : {}),
      },
      ...(place ? (i.family === "P4" ? { places: { pickup: place } } : { place }) : {}),
      ...(i.family === "P3" && i.property_name
        ? { details: { property_name: i.property_name } }
        : {}),
    },
  });
  return {
    kind: "ITEM",
    command,
    summary:
      "Create Manual Item (PRIVATE/SELF; no Booking/Ticket): " +
      canonicalCoreJson(i as Json),
  };
}
export function prepareUpdate(_account: string, raw: unknown): PreparedMutation {
  const q = updateItemInput.parse(raw),
    c = q.change;
  const command = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: q.request_id,
    tripId: q.trip_id,
    command: c.kind === "TEXT" ? "SET_ITEM_TEXT" : "SET_ITEM_SCHEDULE",
    target: { kind: "ITEM", id: q.item_id },
    baseVector: [{ kind: "ITEM", id: q.item_id, revision: q.expected_revision }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload:
      c.kind === "TEXT"
        ? { title: c.title, ...(c.notes !== undefined ? { description: c.notes } : {}) }
        : {
            schedule: {
              start: coreDateBoundary(c.dates.start_date),
              ...(c.dates.end_date ? { end: coreDateBoundary(c.dates.end_date) } : {}),
            },
          },
  });
  return {
    kind: "ITEM",
    command,
    summary:
      `Update ${q.item_id} at revision ${q.expected_revision}: ` +
      canonicalCoreJson(c as Json),
  };
}
export function prepareTrip(account: string, raw: unknown): PreparedMutation {
  const q = createTripInput.parse(raw);
  const command = structuredTripCreateRequestSchema.parse({
    formatVersion: 2,
    operationId: q.request_id,
    tripId: targetId(account, q.request_id),
    name: q.name,
    destination: null,
    destinations: q.destinations.map((displayLabel, index) => ({
      destinationId: targetId(account, q.request_id, String(index)),
      displayLabel,
      source: "MANUAL",
    })),
    startDate: q.dates?.start_date ?? null,
    endDate: q.dates?.end_date ?? null,
  });
  return {
    kind: "TRIP",
    command,
    summary: `Create Trip: ${q.name}; destinations: ${q.destinations.join(", ")}; ${q.dates?.start_date ?? "undated"} → ${q.dates?.end_date ?? "unknown"}`,
  };
}
export function mutationIdentity(account: string, p: PreparedMutation) {
  const c = p.command,
    id = p.kind === "ITEM" ? p.command.target.id : undefined;
  return {
    version: "otr.mcp.mutation/1" as const,
    trip_id: c.tripId,
    ...(id ? { item_id: id } : {}),
    operation_id: c.operationId,
    current_revision: null,
    preview_digest: contentDigest({ accountId: account, kind: p.kind, command: c }),
    summary: p.summary,
    query: { trip_id: c.tripId, operation_id: c.operationId, target: p.kind },
  };
}
export function createMutationTools(context: {
  accountId: string;
  clientId: string;
  resource: string;
  backend?: BackendMutation;
  read?: BackendRead;
  confirm?: ConfirmChanges;
  signal?: AbortSignal;
}) {
  async function request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    if (!context.backend) return null;
    const boundary = createRequestBoundary(
      method === "GET" ? 50000 : 15000,
      context.signal,
    );
    try {
      const response = await boundary.run(() =>
        context.backend!(
          { method, path, ...(body === undefined ? {} : { body }), headers },
          boundary.signal,
        ),
      );
      if (!response.ok) {
        await response.body?.cancel();
        return { status: response.status, body: null };
      }
      return {
        status: response.status,
        body: await readBoundedJson(response, 1048576, boundary),
      };
    } catch {
      return null;
    } finally {
      boundary.close();
    }
  }
  async function dateEditGuard(p: PreparedMutation): Promise<string | null> {
    if (p.kind !== "ITEM" || p.command.command !== "SET_ITEM_SCHEDULE") return null;
    if (!context.read) return "DATE_EDIT_REQUIRES_CURRENT_READ";
    const boundary = createRequestBoundary(50000, context.signal);
    try {
      const response = await boundary.run(() =>
        context.read!(
          `/v2/trips/${p.command.tripId}/core/objects/ITEM/${p.command.target.id}`,
          boundary.signal,
        ),
      );
      if (!response.ok) {
        await response.body?.cancel();
        return "CURRENT_ITEM_UNAVAILABLE";
      }
      const item = itemSchema.parse(await readBoundedJson(response, 1048576, boundary));
      if (item.tripId !== p.command.tripId || item.itemId !== p.command.target.id)
        return "CURRENT_ITEM_SCOPE_MISMATCH";
      if (
        item.schedule.shape === "TRANSPORT" ||
        [item.schedule.start, item.schedule.end].some(
          (t) => t && (t.localTime || t.zoneId || t.instant || t.precision !== undefined),
        )
      )
        return "DATE_EDIT_REQUIRES_OWNING_TEMPORAL_ADAPTER";
      return null;
    } catch {
      return "CURRENT_ITEM_UNAVAILABLE";
    } finally {
      boundary.close();
    }
  }
  async function receipt(p: PreparedMutation, raw: unknown): Promise<MutationResult> {
    const identity = mutationIdentity(context.accountId, p);
    if (p.kind === "TRIP") {
      const r = tripCreateWireResultSchema.parse(raw);
      const input = p.command;
      if (
        r.actorAccountId !== context.accountId ||
        r.operationId !== input.operationId ||
        r.tripId !== input.tripId ||
        r.name !== input.name ||
        r.destination !== input.destination ||
        r.startDate !== input.startDate ||
        r.endDate !== input.endDate ||
        !("destinations" in r) ||
        !("destinations" in input) ||
        contentDigest(r.destinations) !== contentDigest(input.destinations)
      )
        throw Error("RECEIPT_MISMATCH");
      return { ...identity, outcome: "APPLIED", current_revision: r.coreRevision };
    }
    const projection = z
      .object({
        projection: z.literal("FULL"),
        domainReceiptId: z.uuid(),
        receipt: z.unknown(),
      })
      .parse(raw);
    const r = await validateCoreReceipt(projection.receipt, async (bytes) => sha(bytes));
    if (
      r.actorAccountId !== context.accountId ||
      r.tripId !== p.command.tripId ||
      r.operationId !== p.command.operationId ||
      r.command !== p.command.command ||
      r.intentSha256 !==
        (await coreHashValue("otr-trip-core-intent-v2", p.command, async (bytes) =>
          sha(bytes),
        ))
    )
      throw Error("RECEIPT_MISMATCH");
    const target = r.targetVector.find(
      (v) => v.kind === "ITEM" && v.id === p.command.target.id,
    );
    if (!target) throw Error("RECEIPT_TARGET_MISMATCH");
    return {
      ...identity,
      outcome: r.outcome,
      current_revision: target.committedRevision,
      error_code: r.errorCode ?? undefined,
    };
  }
  function path(p: PreparedMutation) {
    return p.kind === "TRIP"
      ? `/v2/trip-create-operations/${p.command.operationId}`
      : `/v2/trips/${p.command.tripId}/core/operations/${p.command.operationId}`;
  }
  async function execute(
    p: PreparedMutation,
    mode: "PREVIEW" | "APPLY",
    previewDigest?: string,
    preapproved = false,
  ): Promise<MutationResult> {
    const identity = mutationIdentity(context.accountId, p);
    if (mode === "PREVIEW") {
      const error = await dateEditGuard(p);
      return error
        ? { ...identity, outcome: "REJECTED", error_code: error }
        : { ...identity, outcome: "PREVIEW" };
    }
    if (previewDigest !== identity.preview_digest)
      return { ...identity, outcome: "REJECTED", error_code: "PREVIEW_MISMATCH" };
    if (
      !preapproved &&
      (!context.confirm ||
        !(await context.confirm(
          {
            accountId: context.accountId,
            clientId: context.clientId,
            resource: context.resource,
            digest: identity.preview_digest,
            summary: identity.summary,
            operationIds: [identity.operation_id],
          },
          context.signal ?? new AbortController().signal,
        )))
    )
      return { ...identity, outcome: "NEEDS_CONFIRMATION" };
    if (!context.backend)
      return { ...identity, outcome: "REJECTED", error_code: "BACKEND_MUTATION_CLOSED" };
    // Exact recovery first: never re-create a successful operation after response loss.
    const known = await request("GET", path(p));
    if (known?.status === 200) {
      try {
        return await receipt(p, known.body);
      } catch {
        return { ...identity, outcome: "UNKNOWN", error_code: "RECEIPT_UNVERIFIED" };
      }
    }
    if (!known || known.status !== 404)
      return { ...identity, outcome: "UNKNOWN", error_code: "RECOVERY_UNAVAILABLE" };
    const guard = await dateEditGuard(p);
    if (guard) return { ...identity, outcome: "REJECTED", error_code: guard };
    const posted = await request(
      "POST",
      p.kind === "TRIP" ? "/v2/trips" : `/v2/trips/${p.command.tripId}/core/commands`,
      p.command,
      p.kind === "TRIP"
        ? { "OTR-Trip-Create-Version": "2", "Idempotency-Key": p.command.operationId }
        : {
            "X-OTR-Core-Contract-Version": "2",
            "Idempotency-Key": p.command.operationId,
          },
    );
    if (posted?.status === 200 || posted?.status === 201) {
      try {
        return await receipt(p, posted.body);
      } catch {
        return { ...identity, outcome: "UNKNOWN", error_code: "RECEIPT_UNVERIFIED" };
      }
    }
    return {
      ...identity,
      outcome:
        posted && [400, 401, 403, 404, 405, 409, 426].includes(posted.status)
          ? "REJECTED"
          : "UNKNOWN",
      error_code:
        posted?.status === 409
          ? "OPERATION_OR_REVISION_CONFLICT"
          : "QUERY_SAME_OPERATION",
    };
  }
  return {
    execute,
    prepareCreate: (raw: unknown) => prepareCreate(context.accountId, raw),
    prepareUpdate: (raw: unknown) => prepareUpdate(context.accountId, raw),
    prepareTrip: (raw: unknown) => prepareTrip(context.accountId, raw),
    async get_operation_status(raw: unknown) {
      const q = operationInput.parse(raw),
        r = await request(
          "GET",
          q.target === "TRIP"
            ? `/v2/trip-create-operations/${q.operation_id}`
            : `/v2/trips/${q.trip_id}/core/operations/${q.operation_id}`,
        );
      if (!r || r.status !== 200)
        return {
          version: "otr.mcp.status/1",
          ...q,
          outcome: "UNKNOWN",
          current_revision: null,
          error_code:
            r?.status === 404
              ? "NOT_VISIBLE_OR_NOT_FOUND_NOT_NO_COMMIT"
              : "RECOVERY_UNAVAILABLE",
        };
      if (q.target === "TRIP") {
        const result = tripCreateWireResultSchema.parse(r.body);
        if (
          result.actorAccountId !== context.accountId ||
          result.tripId !== q.trip_id ||
          result.operationId !== q.operation_id
        )
          throw Error("RECEIPT_MISMATCH");
        return {
          version: "otr.mcp.status/1",
          ...q,
          outcome: "APPLIED",
          current_revision: result.coreRevision,
        };
      }
      const projection = z
        .object({
          projection: z.enum(["FULL", "STATUS_ONLY"]),
          receipt: z.unknown().optional(),
          operationId: z.string().optional(),
          outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]).optional(),
        })
        .parse(r.body);
      if (projection.projection === "STATUS_ONLY") {
        if (projection.operationId !== q.operation_id || projection.outcome === undefined)
          throw Error("RECEIPT_MISMATCH");
        return {
          version: "otr.mcp.status/1",
          ...q,
          outcome: projection.outcome,
          current_revision: null,
        };
      }
      const receipt = await validateCoreReceipt(projection.receipt, async (bytes) =>
        sha(bytes),
      );
      if (
        receipt.actorAccountId !== context.accountId ||
        receipt.tripId !== q.trip_id ||
        receipt.operationId !== q.operation_id
      )
        throw Error("RECEIPT_MISMATCH");
      return {
        version: "otr.mcp.status/1",
        ...q,
        outcome: receipt.outcome,
        current_revision:
          receipt.targetVector.find((v) => v.kind === "ITEM")?.committedRevision ?? null,
      };
    },
  };
}
