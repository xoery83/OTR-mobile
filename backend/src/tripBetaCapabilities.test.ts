import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import registry from "../../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import {
  buildTripBetaCapabilities,
  tripBetaCapabilitiesBoundary,
} from "./tripBetaCapabilities";
const actor = randomUUID(),
  trip = randomUUID();
const context: Parameters<typeof buildTripBetaCapabilities>[0] = {
  actorAccountId: actor,
  tripId: trip,
  accessRevision: 3,
  epoch: randomUUID(),
  observedAt: "2026-11-16T00:00:00Z",
  state: "ACTIVE",
  canManageTrip: false,
  commands: [
    "CREATE_ITEM",
    "CREATE_SPARSE_FLIGHT",
    "SET_ITEM_TEXT",
    "SET_ITEM_PARTICIPATION",
    "SET_OBJECT_VISIBILITY",
    "HIDE_OBJECT",
    "RESTORE_OBJECT",
    "DELETE_ITEM",
    "LINK_EXPENSE",
    "UNLINK_EXPENSE",
  ],
  families: ["P1", "P2", "P3", "P4", "P5", "P6"],
};
const ledger = {
  canRead: true,
  canCreateExpense: true,
  canEditOwnExpense: true,
  canCorrectAnyExpense: false,
  canSuggestCorrection: true,
  canResolveOwnExpenseConflict: true,
  canAddOwnPaymentEvidence: true,
  canManageExpenseValuation: true,
  canManageLedgerValuationPolicy: false,
};
it("maps exactly the frozen103 IDs and reports partial contract branches honestly", () => {
  const result = buildTripBetaCapabilities(context, ledger, true, false, false);
  expect(result.capabilities.map((c) => c.id)).toEqual(
    registry.capabilities.map((c) => c.capabilityId),
  );
  expect(result.capabilities).toHaveLength(103);
  expect(result.capabilities.find((c) => c.id === "otr.p2.create")).toMatchObject({
    implemented: true,
    allowed: true,
    reasonCode: null,
  });
  expect(result.capabilities.find((c) => c.id === "otr.trip.update")).toMatchObject({
    allowed: false,
  });
  expect(result.capabilities.find((c) => c.id === "otr.ledger.history")).toMatchObject({
    implemented: false,
    allowed: false,
    reasonCode: "PERSONAL_PAYMENT_AUDIT_SCHEMA_UNAVAILABLE",
  });
  expect(
    result.capabilities.find((c) => c.id === "otr.ledger.operation.get"),
  ).toMatchObject({
    implemented: false,
    allowed: false,
    reasonCode: "LEDGER_REJECTED_RECEIPT_SCHEMA_UNAVAILABLE",
  });
});
it("keeps archived read/recovery available and pauses normal business writes", () => {
  const result = buildTripBetaCapabilities(
      { ...context, state: "ARCHIVED", canManageTrip: true },
      ledger,
      true,
      true,
      false,
    ),
    get = (id: string) => result.capabilities.find((c) => c.id === id)!;
  expect(get("otr.p3.list").allowed).toBe(true);
  expect(get("otr.core.operation.get").allowed).toBe(true);
  expect(get("otr.p3.update")).toMatchObject({
    allowed: false,
    reasonCode: "TRIP_ARCHIVED",
  });
  expect(get("otr.expense.update").allowed).toBe(false);
  expect(get("otr.trip.unarchive").allowed).toBe(true);
});
it("strictly validates queries and denies outside actors before reading capability facts", async () => {
  const canReadTrip = vi.fn().mockResolvedValue(false),
    read = vi.fn(),
    gateway = { canReadTrip } as unknown as Parameters<
      typeof tripBetaCapabilitiesBoundary
    >[2],
    url = `https://local.test/v2/trips/${trip}/capabilities`;
  expect(
    (
      await tripBetaCapabilitiesBoundary(
        new Request(url + "?actor=forged"),
        actor,
        gateway,
        { betaCapabilityContext: read } as never,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await tripBetaCapabilitiesBoundary(new Request(url), actor, gateway, {
        betaCapabilityContext: read,
      } as never)
    ).status,
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
});

it("reports the existing finalized currency lock without blocking readonly preview", () => {
  const result = buildTripBetaCapabilities(
    { ...context, canManageTrip: true },
    ledger,
    true,
    true,
    true,
  );
  expect(
    result.capabilities.find((c) => c.id === "otr.trip.currency.update"),
  ).toMatchObject({ allowed: false, reasonCode: "JOURNEY_CURRENCY_FINALIZED_LOCK" });
  expect(
    result.capabilities.find((c) => c.id === "otr.trip.currency.preview")?.allowed,
  ).toBe(true);
});
