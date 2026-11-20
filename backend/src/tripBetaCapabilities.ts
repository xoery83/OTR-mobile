import { z } from "zod";
import registry from "../../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";
import type { DevBackendGateway } from "./app";
import type { CoreHttpConnection } from "./tripCoreV2Http";

type Context = Awaited<
  ReturnType<
    NonNullable<NonNullable<CoreHttpConnection["read"]>["betaCapabilityContext"]>
  >
>;
type LedgerCapabilities = z.infer<
  typeof ledgerBootstrapResponseSchema
>["actor"]["capabilities"];
const ids = registry.capabilities.map((c) => c.capabilityId);
export const tripBetaCapabilitySnapshotSchema = z
  .strictObject({
    tripId: coreUuid,
    actorAccountId: coreUuid,
    accessRevision: z.number().int().positive().safe(),
    observedAt: z.iso.datetime(),
    capabilities: z
      .array(
        z.strictObject({
          id: z.string().refine((id) => ids.includes(id)),
          implemented: z.boolean(),
          allowed: z.boolean(),
          reasonCode: z.string().nullable(),
        }),
      )
      .length(103),
  })
  .refine((s) => new Set(s.capabilities.map((c) => c.id)).size === 103);

// Trip-level availability is informational; every target still uses its owning ACL/CAS.
export function buildTripBetaCapabilities(
  context: Context,
  ledger: LedgerCapabilities,
  canWrite: boolean,
  canManageCurrency: boolean,
  hasFinalizedSettlement: boolean,
) {
  const active = context.state === "ACTIVE",
    has = (command: string) => (context.commands as readonly string[]).includes(command);
  const capabilities = registry.capabilities.map((c) => {
    const id = c.capabilityId;
    let allowed = false,
      reasonCode: string | null = null;
    if (id === "otr.ledger.history")
      return {
        id,
        implemented: false,
        allowed: false,
        reasonCode: "PERSONAL_PAYMENT_AUDIT_SCHEMA_UNAVAILABLE",
      };
    if (id === "otr.ledger.operation.get")
      return {
        id,
        implemented: false,
        allowed: false,
        reasonCode: "LEDGER_REJECTED_RECEIPT_SCHEMA_UNAVAILABLE",
      };
    if (c.family) {
      const operation = id.split(".").at(-1)!;
      allowed =
        ["list", "search", "get"].includes(operation) ||
        (active &&
          context.families.includes(c.family) &&
          (operation === "create"
            ? has(c.family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM")
            : operation === "update"
              ? has("SET_ITEM_TEXT")
              : operation === "hide"
                ? has("HIDE_OBJECT")
                : operation === "restore"
                  ? has("RESTORE_OBJECT")
                  : operation === "delete"
                    ? has("DELETE_ITEM")
                    : operation === "visibility"
                      ? has("SET_OBJECT_VISIBILITY")
                      : operation === "participation"
                        ? has("SET_ITEM_PARTICIPATION")
                        : false));
      reasonCode = allowed
        ? null
        : !active
          ? "TRIP_" + context.state
          : "CORE_CAPABILITY_CLOSED";
    } else
      switch (id) {
        case "otr.trip.list":
        case "otr.trip.get":
        case "otr.trip.create":
        case "otr.people.list":
        case "otr.permissions.read":
        case "otr.core.collection.read":
        case "otr.core.operation.get":
        case "otr.trip.operation.get":
        case "otr.metadata.operation.get":
        case "otr.trip.lifecycle.operation.get":
        case "otr.item.lifecycle.base":
          allowed = true;
          break;
        case "otr.trip.lifecycle.base":
          allowed = context.canManageTrip;
          break;
        case "otr.trip.update":
          allowed = context.canManageTrip && active;
          break;
        case "otr.trip.archive":
          allowed = context.canManageTrip && context.state !== "DELETED";
          break;
        case "otr.trip.unarchive":
          allowed = context.canManageTrip && context.state !== "DELETED";
          break;
        case "otr.trip.delete":
          allowed = context.canManageTrip;
          break;
        case "otr.trip.currency.preview":
          allowed = canManageCurrency;
          break;
        case "otr.trip.currency.update":
          allowed = canManageCurrency && active && !hasFinalizedSettlement;
          if (canManageCurrency && active && hasFinalizedSettlement)
            reasonCode = "JOURNEY_CURRENCY_FINALIZED_LOCK";
          break;
        case "otr.expense.list":
        case "otr.expense.get":
        case "otr.expense.conflicts":
        case "otr.fx.snapshots":
        case "otr.settlement.preview":
        case "otr.settlement.list":
        case "otr.settlement.get":
        case "otr.settlement.history":
        case "otr.settlement.payments.read":
        case "otr.personal_payment.list":
        case "otr.personal_payment.get":
        case "otr.personal_review.read":
        case "otr.ledger.export":
          allowed = ledger.canRead;
          break;
        case "otr.fx.lookup":
          allowed = ledger.canRead;
          break;
        case "otr.expense.create":
          allowed = canWrite && ledger.canCreateExpense && active;
          break;
        case "otr.expense.update":
        case "otr.expense.delete":
        case "otr.expense.restore":
          allowed =
            canWrite &&
            (ledger.canEditOwnExpense || ledger.canCorrectAnyExpense) &&
            active;
          break;
        case "otr.expense.valuation":
          allowed = canWrite && ledger.canManageExpenseValuation && active;
          break;
        case "otr.expense.payment_record":
          allowed = canWrite && ledger.canAddOwnPaymentEvidence && active;
          break;
        case "otr.expense.resolve":
          allowed =
            canWrite &&
            (ledger.canResolveOwnExpenseConflict || ledger.canCorrectAnyExpense) &&
            active;
          break;
        case "otr.expense.link":
        case "otr.expense.unlink":
          allowed =
            canWrite &&
            ledger.canRead &&
            active &&
            has(id === "otr.expense.link" ? "LINK_EXPENSE" : "UNLINK_EXPENSE");
          break;
        default:
          throw new Error("CAPABILITY_REGISTRY_MAPPING_MISSING");
      }
    return {
      id,
      implemented: true,
      allowed,
      reasonCode:
        reasonCode ??
        (allowed
          ? null
          : !active && c.effect !== "READ"
            ? "TRIP_" + context.state
            : "OWNING_AUTHORITY_REQUIRED"),
    };
  });
  return tripBetaCapabilitySnapshotSchema.parse({
    tripId: context.tripId,
    actorAccountId: context.actorAccountId,
    accessRevision: context.accessRevision,
    observedAt: context.observedAt,
    capabilities,
  });
}
export async function tripBetaCapabilitiesBoundary(
  request: Request,
  actor: string,
  gateway: Pick<
    DevBackendGateway,
    "canReadTrip" | "bootstrapLedger" | "canWriteTrip" | "canFinalizeSettlement"
  >,
  read?: CoreHttpConnection["read"],
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
    match = /^\/v2\/trips\/([^/]+)\/capabilities$/.exec(url.pathname);
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    url.search ||
    request.body !== null
  )
    return fail(400, "INVALID_PAYLOAD");
  const trip = match[1];
  try {
    if (!(await gateway.canReadTrip(actor, trip))) return fail(403, "FORBIDDEN");
    if (!read?.betaCapabilityContext) return fail(503, "CAPABILITY_UNAVAILABLE");
    const before = await read.betaCapabilityContext(actor, trip);
    const ledger = ledgerBootstrapResponseSchema.parse(
      await gateway.bootstrapLedger(actor, trip),
    );
    const canWrite = await gateway.canWriteTrip(actor, trip),
      canManageCurrency = await gateway.canFinalizeSettlement(actor, trip);
    const after = await read.betaCapabilityContext(actor, trip);
    if (
      before.actorAccountId !== actor ||
      after.actorAccountId !== actor ||
      before.tripId !== trip ||
      after.tripId !== trip ||
      ledger.actor.userId !== actor ||
      ledger.journey.id !== trip
    )
      throw new Error("RESULT_MISMATCH");
    if (
      before.accessRevision !== after.accessRevision ||
      before.epoch !== after.epoch ||
      before.state !== after.state ||
      before.canManageTrip !== after.canManageTrip ||
      JSON.stringify(before.commands) !== JSON.stringify(after.commands)
    )
      return fail(409, "STALE_PREVIEW");
    return reply(
      200,
      buildTripBetaCapabilities(
        after,
        ledger.actor.capabilities,
        canWrite,
        canManageCurrency,
        (ledger.settlements?.length ?? 0) > 0,
      ),
    );
  } catch {
    return fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
