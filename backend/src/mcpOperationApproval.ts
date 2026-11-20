import {
  createTripMetadataV2PgStorage,
  withTripMetadataV2PgStorageOnTransaction,
} from "./tripMetadataV2PgStorage";
import { TripMetadataError } from "./tripMetadata";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { betaRequest, parseBetaCall, type FirstPartyApprovalPort } from "../../mcp/beta";
import { contentDigest, type ApprovalRequest } from "../../mcp/mutation";
import { createBetaConfirmationCodec } from "../../mcp/betaConfirmation";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";

const scopeSchema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.uuid(),
  resource: z.url(),
  tripId: z.uuid(),
  operationId: z.uuid(),
  oldName: z.string().min(1),
  newName: z.string().min(1),
});
const scopedApprovalSchema = z.discriminatedUnion("kind", [
  scopeSchema.extend({ kind: z.literal("TRIP_NAME") }),
  scopeSchema
    .omit({ oldName: true, newName: true })
    .extend({
      kind: z.literal("TRIP_DELETE"),
      operationIds: z.array(z.uuid()).max(3).optional(),
    }),
  z.strictObject({
    kind: z.literal("TRIP_DELETE_STANDING"),
    policyHash: z.string().regex(/^[a-f0-9]{64}$/),
    accountId: z.uuid(),
    clientId: z.uuid(),
    resource: z.url(),
  }),
]);
const managedConsent = z.strictObject({
  evidenceId: z.uuid(), sessionId: z.uuid(), policyHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const recordSchema = z.object({
  managedConsent: managedConsent.nullish(),
  kind: z.literal("TRIP_DELETE").optional(),
  targetName: z.string().optional(),
  id: z.uuid().nullable(),
  state: z.enum(["MISSING", "PENDING", "APPROVED", "DECLINED", "EXPIRED"]),
  accountId: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  resource: z.url(),
  tripId: z.uuid(),
  operationId: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  call: z.unknown(),
  completed: z.boolean(),
  expiresAt: z.string().nullable(),
  decisionAt: z.string().nullable(),
  normalSessionId: z.uuid().nullable(),
});
export type OperationApprovalRecord = z.infer<typeof recordSchema>;
export class OperationApprovalError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}
export function createMcpOperationApprovalStore(
  connection: CorePgConnection,
  authority: "METADATA" | "L3_TRIP_DELETE" | "MANAGED_L3_TRIP_DELETE" = "METADATA",
) {
  const functionName = {
    L3_TRIP_DELETE: "mcp_l3_trip_delete_approval",
    MANAGED_L3_TRIP_DELETE: "mcp_managed_l3_trip_delete_approval",
    METADATA: "mcp_operation_approval",
  }[authority];
  return async (
    action: "PREPARE" | "CHECK" | "READ" | "DECIDE",
    actor: string,
    id: string | null,
    context: unknown,
    decision: boolean | null,
    session: string | null,
  ) => {
    try {
      const value = await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const result = await lease.query(
            `SELECT public.${functionName}($1::text,$2::uuid,$3::uuid,$4::jsonb,$5::boolean,$6::uuid) AS result`,
            [
              action,
              actor,
              id,
              context === null ? null : JSON.stringify(context),
              decision,
              session,
            ],
          );
          const checked = recordSchema.parse(result.rows[0]?.result);
          await lease.query("COMMIT");
          return checked;
        } catch (error) {
          try {
            await lease.query("ROLLBACK");
          } catch {
            await lease.retire();
          }
          throw error;
        }
      });
      return recordSchema.parse(value);
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new OperationApprovalError(
        code === "P0002"
          ? 404
          : ["40001", "23505"].includes(code ?? "")
            ? 409
            : code === "55000"
              ? 410
              : 403,
        "OPERATION_APPROVAL_UNAVAILABLE",
        { cause: e },
      );
    }
  };
}
export type OperationApprovalStore = ReturnType<typeof createMcpOperationApprovalStore>;
export function createMcpOperationApprovalService(
  rawScope: unknown,
  store: OperationApprovalStore,
  csrfSecret: string,
) {
  const scope = scopedApprovalSchema.parse({
    kind: "TRIP_NAME",
    ...z.record(z.string(), z.unknown()).parse(rawScope),
  });
  if (
    new URL(scope.resource).protocol !== "https:" ||
    new URL(scope.resource).pathname !== "/mcp" ||
    csrfSecret.length < 32
  )
    throw Error("OPERATION_APPROVAL_CONFIG_REQUIRED");
  const operations = scope.kind === "TRIP_DELETE_STANDING" ? undefined : new Set([
    scope.operationId,
    ...(scope.kind === "TRIP_DELETE" ? (scope.operationIds ?? []) : []),
  ]);
  const deleteScope = scope.kind !== "TRIP_NAME";
  const origin = new URL(scope.resource).origin;
  const csrfCodec = createBetaConfirmationCodec(
    createHmac("sha256", csrfSecret).update("otr-operation-page-csrf/1").digest(),
  );
  const current = (signal: AbortSignal) => signal.throwIfAborted();
  function binding(approval: ApprovalRequest, raw: unknown) {
    const { capability, call } = parseBetaCall(raw);
    const request = call.request as {
      operationId?: string;
      action?: string;
      before?: { name?: string };
      after?: { name?: string };
    };
    const operationId = request.operationId ?? "";
    const { name: _before, ...before } = request.before ?? {},
      { name: _after, ...after } = request.after ?? {};
    if (
      capability.capabilityId !==
        (deleteScope ? "otr.trip.delete" : "otr.trip.update") ||
      (scope.kind === "TRIP_DELETE_STANDING" && approval.managedConsent?.policyHash !== scope.policyHash) ||
      approval.accountId !== scope.accountId ||
      approval.clientId !== scope.clientId ||
      approval.resource !== scope.resource ||
      ("tripId" in scope && call.pathParams.tripId !== scope.tripId) ||
      (operations && !operations.has(operationId)) ||
      approval.operationIds.length !== 1 ||
      approval.operationIds[0] !== operationId ||
      (scope.kind === "TRIP_NAME" &&
        (request.before?.name !== scope.oldName ||
          request.after?.name !== scope.newName ||
          contentDigest(before) !== contentDigest(after))) ||
      (deleteScope && request.action !== "DELETE") ||
      approval.digest !==
        contentDigest({
          accountId: approval.accountId,
          clientId: approval.clientId,
          resource: approval.resource,
          call,
          request: betaRequest(call, operationId),
        })
    )
      throw new OperationApprovalError(403, "OPERATION_APPROVAL_BINDING_MISMATCH");
    return {
      accountId: scope.accountId,
      clientId: scope.clientId,
      resource: scope.resource,
      operationIds: [operationId],
      digest: approval.digest,
      ...(approval.managedConsent ? { managedConsent: approval.managedConsent } : {}),
      call,
    };
  }
  function checkRecord(raw: unknown) {
    const row = recordSchema.parse(raw);
    if (
      (deleteScope && (row.kind !== "TRIP_DELETE" || !row.targetName)) ||
      row.accountId !== scope.accountId ||
      row.clientId !== scope.clientId ||
      row.resource !== scope.resource ||
      ("tripId" in scope && row.tripId !== scope.tripId) ||
      (operations && !operations.has(row.operationId))
    )
      throw new OperationApprovalError(404, "OPERATION_APPROVAL_NOT_FOUND");
    binding({ ...row, managedConsent: row.managedConsent ?? undefined, operationIds: [row.operationId], summary: "" }, row.call);
    return row;
  }
  function link(row: OperationApprovalRecord) {
    return {
      id: row.id,
      state: row.state,
      url: row.id ? origin + "/mcp/approve?approval_id=" + row.id : null,
      expiresAt: row.expiresAt,
      completed: row.completed,
      decisionAt: row.decisionAt,
    };
  }
  const port: FirstPartyApprovalPort = {
    async prepare(approval, call, signal) {
      current(signal);
      const row = checkRecord(
        await store(
          "PREPARE",
          approval.accountId,
          null,
          binding(approval, call),
          null,
          null,
        ),
      );
      current(signal);
      return link(row);
    },
    async check(approval, call, signal) {
      current(signal);
      const row = checkRecord(
        await store(
          "CHECK",
          approval.accountId,
          null,
          binding(approval, call),
          null,
          null,
        ),
      );
      current(signal);
      return {
        ...link(row),
        approved:
          row.state === "APPROVED" &&
          !!row.normalSessionId &&
          !!row.decisionAt &&
          Date.parse(row.expiresAt ?? "") > Date.now(),
        binding: {
          accountId: row.accountId,
          clientId: row.clientId,
          resource: row.resource,
          operationIds: [row.operationId],
          digest: row.digest,
        },
      };
    },
  };
  function sessionBinding(row: OperationApprovalRecord, session: string) {
    return {
      accountId: row.accountId,
      clientId: row.clientId,
      resource: row.resource,
      operationIds: [row.operationId],
      summary: "",
      digest: contentDigest({ purpose: "operation-page-csrf/1", id: row.id, session }),
    };
  }
  async function read(
    id: string,
    principal: { accountId: string; sessionId: string },
    signal: AbortSignal,
  ) {
    z.uuid().parse(id);
    z.uuid().parse(principal.sessionId);
    if (principal.accountId !== scope.accountId)
      throw new OperationApprovalError(404, "OPERATION_APPROVAL_NOT_FOUND");
    current(signal);
    const row = checkRecord(
      await store("READ", principal.accountId, id, null, null, principal.sessionId),
    );
    current(signal);
    return row;
  }
  return {
    port,
    async view(
      id: string,
      principal: { accountId: string; sessionId: string },
      signal: AbortSignal,
    ) {
      const row = await read(id, principal, signal);
      const { normalSessionId: _session, managedConsent: _consent, ...visible } = row;
      return {
        ...visible,
        ...(row.state === "PENDING" &&
        !row.completed &&
        Date.parse(row.expiresAt ?? "") > Date.now()
          ? {
              csrfContext: csrfCodec.mint(
                sessionBinding(row, principal.sessionId),
                Math.min(Date.parse(row.expiresAt!), Date.now() + 300000),
              ),
            }
          : {}),
      };
    },
    async decide(
      id: string,
      principal: { accountId: string; sessionId: string },
      context: string,
      decision: boolean,
      signal: AbortSignal,
    ) {
      const row = await read(id, principal, signal);
      try {
        const proof = csrfCodec.verify(context);
        const expected = sessionBinding(row, principal.sessionId);
        if (
          proof.accountId !== expected.accountId ||
          proof.clientId !== expected.clientId ||
          proof.resource !== expected.resource ||
          proof.digest !== expected.digest ||
          JSON.stringify(proof.operationIds) !== JSON.stringify(expected.operationIds)
        )
          throw Error("CSRF_BINDING");
      } catch {
        throw new OperationApprovalError(403, "OPERATION_APPROVAL_CONTEXT_CHANGED");
      }
      current(signal);
      const decided = checkRecord(
        await store(
          "DECIDE",
          principal.accountId,
          id,
          null,
          decision,
          principal.sessionId,
        ),
      );
      current(signal);
      return decided;
    },
  };
}
export function createMcpOperationApprovalHandler(options: {
  origin: string;
  service: ReturnType<typeof createMcpOperationApprovalService>;
  authenticate(
    token: string,
    signal: AbortSignal,
  ): Promise<{ accountId: string; sessionId: string } | null>;
}) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url),
      match = /^\/mcp\/operation-approvals\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (!match) return null;
    const reply = (status: number, body: unknown) =>
      Response.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Authorization",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    if (
      url.origin !== options.origin ||
      url.search ||
      !["GET", "POST"].includes(request.method)
    )
      return reply(400, { error: { code: "OPERATION_APPROVAL_REQUEST_INVALID" } });
    const boundary = createRequestBoundary(10000, request.signal);
    try {
      if (request.method === "POST" && request.headers.get("Origin") !== options.origin)
        throw new OperationApprovalError(403, "OPERATION_APPROVAL_ORIGIN_REQUIRED");
      const token = /^Bearer ([^\s]+)$/.exec(
        request.headers.get("Authorization") ?? "",
      )?.[1];
      if (!token) throw new OperationApprovalError(401, "NORMAL_AUTH_REQUIRED");
      const principal = await boundary.run(() =>
        options.authenticate(token, boundary.signal),
      );
      if (!principal) throw new OperationApprovalError(401, "NORMAL_AUTH_REQUIRED");
      if (request.method === "GET") {
        if (request.body !== null)
          throw new OperationApprovalError(400, "OPERATION_APPROVAL_REQUEST_INVALID");
        return reply(
          200,
          await options.service.view(match[1], principal, boundary.signal),
        );
      }
      const body = z
        .strictObject({ decision: z.enum(["APPROVE", "DECLINE"]) })
        .parse(await readBoundedJson(new Response(request.body), 4096, boundary));
      const row = await options.service.decide(
        match[1],
        principal,
        request.headers.get("X-OTR-Operation-Context") ?? "",
        body.decision === "APPROVE",
        boundary.signal,
      );
      return reply(200, {
        id: row.id,
        state: row.state,
        expiresAt: row.expiresAt,
        decisionAt: row.decisionAt,
        completed: row.completed,
      });
    } catch (e) {
      const error =
        e instanceof OperationApprovalError
          ? e
          : e instanceof z.ZodError
            ? new OperationApprovalError(400, "OPERATION_APPROVAL_REQUEST_INVALID")
            : new OperationApprovalError(503, "OPERATION_APPROVAL_UNAVAILABLE");
      return reply(error.status, { error: { code: error.code } });
    } finally {
      boundary.close();
    }
  };
}

// Original metadata transaction/validator/writer remain the only business authority.
export function createApprovalBoundMetadataPort(
  connection: CorePgConnection,
  grant: { accountId: string; clientId: string; resource: string },
) {
  return {
    ...createTripMetadataV2PgStorage(connection),
    async update(
      actor: string,
      request: Parameters<ReturnType<typeof createTripMetadataV2PgStorage>["update"]>[1],
    ) {
      if (actor !== grant.accountId)
        throw new TripMetadataError(403, "OPERATION_APPROVAL_ACTOR_MISMATCH");
      return connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        try {
          const proof = await lease.query(
            "SELECT public.mcp_operation_approval_for_metadata($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb) AS allowed",
            [
              actor,
              grant.clientId,
              grant.resource,
              request.operationId,
              JSON.stringify(request),
            ],
          );
          if (proof.rows[0]?.allowed !== true)
            throw new TripMetadataError(403, "OPERATION_APPROVAL_REQUIRED");
          const result = await withTripMetadataV2PgStorageOnTransaction(lease, (port) =>
            port.update(actor, request),
          );
          await lease.query("COMMIT");
          return result;
        } catch (error) {
          await lease.query("ROLLBACK").catch(() => lease.retire());
          if ((error as { code?: string }).code === "42501")
            throw new TripMetadataError(403, "OPERATION_APPROVAL_REQUIRED");
          throw error;
        }
      });
    },
  };
}
