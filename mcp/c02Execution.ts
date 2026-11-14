// Unmounted C02-S1 execution restriction; trusted Host Auth/Consent and confirmation remain required.
import { z } from "zod";
import {
  coreCommandSchema,
  validateCoreCommand,
} from "../src/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
import { contentDigest, mutationIdentity, sha } from "./mutation";
import type { McpOptions } from "./server";
import { createReadTools, type BackendRead } from "./read";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";

const accountId = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const tripId = "cc44a705-6f43-41e0-a2f9-16f334b2a6b2";
const clientId = "83504d3f-59d4-43fd-99b1-bebc54c40f7d";
const resource = "https://api-dev.xoery.art/mcp";
const historical = new Set([
  "3616da44-0d35-4400-a739-01f1029565ea",
  "11fdaec9-3305-4db0-a146-be78823fcf74",
  "2777810c-24d9-4ecf-998c-9fc5dd00de34",
  "1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf",
  "f10713fc-d86c-456f-a4c9-929a1cced3e8",
  "9b077556-e0c3-46a9-8d97-2090504fa856",
]);
export const c02ExecutionPlan = z
  .strictObject({
    gateSHA256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .refine((v) => v !== "0".repeat(64)),
    windowId: z.uuid(),
    startsAt: z.number().int().positive(),
    normalCloseAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    command: coreCommandSchema
      .transform((c, ctx) => {
        try {
          return validateCoreCommand(c);
        } catch {
          ctx.addIssue({ code: "custom", message: "VALID_CORE_PAYLOAD_REQUIRED" });
          return z.NEVER;
        }
      })
      .nullable(),
    createdOperationId: z.uuid().optional(),
  })
  .superRefine((p, ctx) => {
    const c = p.command;
    const payload = c?.payload as
      | {
          acl?: { visibility?: string };
          participation?: { mode?: string; people?: unknown[]; selfPersonId?: unknown };
        }
      | undefined;
    if (
      p.expiresAt - p.startsAt > 1800000 ||
      p.normalCloseAt <= p.startsAt ||
      p.normalCloseAt !== p.expiresAt - 120000 ||
      (c &&
        (c.tripId !== tripId ||
          c.target.kind !== "ITEM" ||
          historical.has(c.target.id) ||
          historical.has(c.operationId) ||
          c.admission.mode !== "MANUAL" ||
          c.admission.sourceIntentId !== null ||
          c.admission.policyVersion !== null ||
          c.baseVector.length !== 1 ||
          c.baseVector[0].kind !== "ITEM" ||
          c.baseVector[0].id !== c.target.id ||
          !(
            (c.command === "CREATE_ITEM" &&
              (c.payload as { family?: string }).family === "P3" &&
              payload?.acl?.visibility === "PRIVATE" &&
              payload.participation?.mode === "SELF" &&
              payload.participation.people?.length === 0 &&
              payload.participation.selfPersonId === null &&
              c.baseVector[0].revision === null) ||
            (c.command === "SET_ITEM_SCHEDULE" &&
              c.baseVector[0].revision === 1 &&
              p.createdOperationId &&
              !historical.has(p.createdOperationId) &&
              p.createdOperationId !== c.operationId)
          )))
    )
      ctx.addIssue({ code: "custom", message: "C02_EXACT_SCOPE_REQUIRED" });
  });

// The plan is private Host input, never an MCP tool parameter or evidence extracted from an attachment.
export function restrictC02Execution(base: McpOptions, input: unknown): McpOptions {
  const plan = c02ExecutionPlan.parse(input),
    command = plan.command;
  if (base.resource !== resource) throw Error("C02_RESOURCE_REQUIRED");
  const identity = command
    ? mutationIdentity(accountId, { kind: "ITEM", command, summary: "" })
    : null;
  const current = () => Date.now() >= plan.startsAt && Date.now() < plan.normalCloseAt;
  return {
    ...base,
    taskAssistant: false,
    bindTaskDomains: undefined,
    toolProfile: "P3_STAY_QA",
    authorize: async (request) => {
      if (!current()) return null;
      const auth = await base.authorize?.(request);
      if (
        !auth ||
        auth.accountId !== accountId ||
        auth.clientId !== clientId ||
        auth.resource !== resource ||
        auth.expiresAt <= Date.now() ||
        auth.expiresAt > Math.min(Date.now() + 60000, plan.expiresAt) ||
        !current()
      )
        return null;
      if (command?.command === "SET_ITEM_SCHEDULE") {
        if (!auth.backend) return null;
        const r = await auth.backend(
          {
            method: "GET",
            path: `/v2/trips/${tripId}/core/operations/${plan.createdOperationId}`,
          },
          request.signal,
        );
        if (!r.ok) {
          await r.body?.cancel();
          return null;
        }
        try {
          const boundary = createRequestBoundary(10000, request.signal);
          let projection;
          try {
            projection = await readBoundedJson(r, 1048576, boundary);
          } finally {
            boundary.close();
          }
          if (
            !projection ||
            typeof projection !== "object" ||
            !("projection" in projection) ||
            !("receipt" in projection)
          )
            return null;
          if (projection.projection !== "FULL") return null;
          const receipt = await validateCoreReceipt(projection.receipt, async (bytes) =>
            sha(bytes),
          );
          const committedAt = Date.parse(receipt.committedAt);
          if (
            receipt.actorAccountId !== accountId ||
            receipt.tripId !== tripId ||
            receipt.operationId !== plan.createdOperationId ||
            receipt.command !== "CREATE_ITEM" ||
            receipt.outcome !== "APPLIED" ||
            !Number.isFinite(committedAt) ||
            committedAt < plan.startsAt ||
            committedAt >= plan.normalCloseAt ||
            committedAt > Date.now() ||
            !receipt.audit.after.some(
              (v) =>
                v.kind === "ITEM" &&
                v.id === command.target.id &&
                (v.facts as { experience_family?: string }).experience_family === "P3" &&
                (v.facts as { owner_account_id?: string }).owner_account_id ===
                  accountId &&
                (v.facts as { visibility?: string }).visibility === "PRIVATE" &&
                (v.facts as { participation_mode?: string }).participation_mode ===
                  "SELF",
            ) ||
            !receipt.targetVector.some(
              (v) =>
                v.kind === "ITEM" &&
                v.id === command.target.id &&
                v.committedRevision === 1,
            )
          )
            return null;
        } catch {
          return null;
        }
      }
      if (!current() || auth.expiresAt <= Date.now()) return null;
      const windowRead: BackendRead = async (path, signal) => {
        if (!current()) return Response.json({ error: "C02_CLOSED" }, { status: 401 });
        const response = await auth.read(path, signal);
        if (!current()) {
          await response.body?.cancel().catch(() => undefined);
          return Response.json({ error: "C02_CLOSED" }, { status: 401 });
        }
        return response;
      };
      return {
        ...auth,
        expiresAt: Math.min(auth.expiresAt, plan.normalCloseAt),
        read: async (path, signal) => {
          if (!current()) return Response.json({ error: "C02_CLOSED" }, { status: 401 });
          if (/^\/v2\/trips\?limit=\d+(?:&cursor=[0-9a-f-]{36})?$/.test(path)) {
            const cursor = new URL(path, resource).searchParams.get("cursor");
            if (cursor && cursor >= tripId)
              return Response.json({ trips: [], nextCursor: null });
            const found = await createReadTools(accountId, windowRead, signal).get_trip({
              trip_id: tripId,
            });
            if (!current())
              return Response.json({ error: "C02_CLOSED" }, { status: 401 });
            return Response.json({ trips: [found.trip], nextCursor: null });
          }
          if (!(
            path === `/v2/trips/${tripId}/core/collection` ||
            new RegExp(`^/v2/trips/${tripId}/core/objects/ITEM/[0-9a-f-]{36}$`).test(path)
          ))
            return Promise.resolve(
              Response.json({ error: "NOT_VISIBLE" }, { status: 404 }),
            );
          return windowRead(path, signal);
        },
        backend: async (q, signal) => {
          if (!current() || !auth.backend || !auth.scopes.includes("otr.trips.write"))
            return Response.json({ error: "C02_WRITE_CLOSED" }, { status: 403 });
          if (
            q.method === "GET" &&
            new RegExp(`^/v2/trips/${tripId}/core/operations/[0-9a-f-]{36}$`).test(q.path)
          ) {
            const response = await auth.backend(q, signal);
            if (!current()) {
              await response.body?.cancel().catch(() => undefined);
              return Response.json({ error: "C02_CLOSED" }, { status: 401 });
            }
            return response;
          }
          if (
            !command ||
            q.method !== "POST" ||
            q.path !== `/v2/trips/${tripId}/core/commands` ||
            contentDigest(q.body) !== contentDigest(command)
          )
            return Response.json({ error: "C02_COMMAND_NOT_CONFIRMED" }, { status: 403 });
          if (
            !identity ||
            !base.confirm ||
            !(await base.confirm(
              {
                accountId,
                clientId,
                resource,
                digest: identity.preview_digest,
                operationIds: [identity.operation_id],
                summary: identity.summary,
              },
              signal,
            )) ||
            !current()
          )
            return Response.json({ error: "C02_COMMAND_NOT_CONFIRMED" }, { status: 403 });
          // Existing Auth port rechecks Grant/Consent, Core rechecks Authority/CAS and owns the receipt.
          const response = await auth.backend(q, signal);
          if (!current()) {
            await response.body?.cancel().catch(() => undefined);
            return Response.json(
              { error: "C02_WRITE_OUTCOME_UNKNOWN_QUERY_ORIGINAL" },
              { status: 503 },
            );
          }
          return response;
        },
      };
    },
    confirm: async (q, signal) =>
      !!(
        current() &&
        identity &&
        base.confirm &&
        q.accountId === accountId &&
        q.clientId === clientId &&
        q.resource === resource &&
        q.operationIds.length === 1 &&
        q.operationIds[0] === identity.operation_id &&
        q.digest === identity.preview_digest &&
        (await base.confirm(q, signal)) &&
        current()
      ),
  };
}
