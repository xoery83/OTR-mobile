import { beforeEach, expect, it, vi } from "vitest";
import { coreClosedCapabilities } from "@/domain/trip/tripCoreV2Commands";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createNativeNormalTripSyncRunner } from "./tripNormalCoordinator";

const accountId = "10000000-0000-4000-8000-000000000001",
  tripId = "10000000-0000-4000-8000-000000000002",
  itemId = "10000000-0000-4000-8000-000000000003",
  operationId = "10000000-0000-4000-8000-000000000004";
const f = vi.hoisted(() => ({
  receipt: vi.fn(),
  capabilities: vi.fn(),
  submit: vi.fn(),
  refresh: vi.fn(),
  apply: vi.fn(),
  accepted: vi.fn(),
  first: vi.fn(),
  graph: vi.fn(),
  eligibility: vi.fn(),
  parent: null as null | ((tripId: string, command: any) => Promise<any>),
  ready: null as null | ((tripId: string, command: any) => Promise<boolean>),
  pendingRows: null as null | any[],
  command: {} as any,
  operation: {} as any,
  state: "IN_FLIGHT",
  choose: null as
    null | ((trip: string, item: string, family: string) => Promise<boolean>),
}));
vi.mock("./syncOperationRepository", () => ({
  createSyncOperationRepository: () => ({}),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: async () => accountId }));
vi.mock("../db/database", () => ({
  readInitializedDatabase: async () => ({ getFirstAsync: f.first }),
}));
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({}),
}));
vi.mock("../api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => ({
    receipt: f.receipt,
    capabilities: f.capabilities,
    submit: f.submit,
  }),
}));
vi.mock("../repositories/tripCoreV2Repository", () => ({
  createTripCoreV2Repository: () => ({
    captureContext: (id: string) =>
      captureAccountRequestContext(id, async () => accountId),
    pending: async () => f.pendingRows ?? [{ command: f.command, state: f.state }],
    manualInstructionEligibility: f.eligibility,
    readGraph: f.graph,
    acceptedSnapshot: f.accepted,
    refresh: f.refresh,
    applyReceipt: async (...args: unknown[]) => {
      f.apply(...args);
      f.state = "APPLIED";
    },
  }),
}));
vi.mock("./tripCoreV2SyncWorker", async (actual) => ({
  ...(await actual<typeof import("./tripCoreV2SyncWorker")>()),
  createCoreV2SyncCoordinator: (_queue: unknown, worker: any) => ({
    run: () => worker.push(f.operation),
  }),
}));
vi.mock("./tripNormalSync", async (actual) => ({
  ...(await actual<typeof import("./tripNormalSync")>()),
  createNormalTripSyncWake: (deps: any) => {
    f.choose = deps.isManualItem;
    f.parent = deps.resolveInstructionParent;
    f.ready = deps.participantsReady;
    return () => deps.runP1({ accountId, tripId, operationId });
  },
}));
const run = () =>
  createNativeNormalTripSyncRunner(
    { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
    () => true,
  )("AUTHENTICATED_ONLINE");
function snapshot(family = "P6", owner = accountId, revision = 3) {
  return {
    certificate: { complete: 1 },
    actor: { active: true, accountId, tripId, personId: null, canManageShared: false },
    graph: {
      itinerary_events: [
        {
          id: itemId,
          trip_id: tripId,
          experience_family: family,
          owner_account_id: owner,
          semantic_revision: revision,
          hidden_at: null,
          status: "planned",
          visibility: "PRIVATE",
        },
      ],
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  f.state = "IN_FLIGHT";
  f.pendingRows = null;
  f.eligibility.mockResolvedValue({ status: "UNPROVEN" });
  f.command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId,
    tripId,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: 3 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "Fresh edit", description: null },
  };
  f.operation = {
    id: operationId,
    tripId,
    entityType: "TRIP_CORE_V2",
    entityId: itemId,
    operationType: "CORE_V2_COMMAND",
    idempotencyKey: operationId,
    payloadJson: JSON.stringify(f.command),
    ownerUserId: accountId,
  };
  f.first.mockResolvedValue(null);
  f.receipt.mockResolvedValue(null);
  f.accepted.mockResolvedValue(snapshot());
  f.graph.mockImplementation(async () => (await f.accepted()).graph);
  f.capabilities.mockResolvedValue({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: ["SET_ITEM_TEXT"],
    enabledAdmissionModes: ["MANUAL"],
    enabledFamilies: ["P6", "P5"],
  });
  f.submit.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: operationId,
    receipt: { outcome: "APPLIED" },
  });
});
it("fresh own P6 uses normal capabilities, original operation and authorized Accepted refresh", async () => {
  await run();
  expect(f.receipt).toHaveBeenCalledBefore(f.capabilities);
  expect(f.capabilities).toHaveBeenCalledBefore(f.submit);
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, tripId }),
    f.command,
  );
  expect(f.refresh).toHaveBeenCalledOnce();
  expect(await f.choose!(tripId, itemId, "P6")).toBe(true);
});
it.each([
  "removed",
  "hidden",
  "foreign",
  "revision",
  "other-family",
  "inactive",
  "uncertified",
])(
  "new POST denies current target %s without manufacturing a replacement",
  async (kind) => {
    const value = snapshot();
    if (kind === "removed") value.graph.itinerary_events = [];
    if (kind === "hidden")
      value.graph.itinerary_events[0].hidden_at = "2026-11-04T00:00:00Z" as never;
    if (kind === "foreign") value.graph.itinerary_events[0].owner_account_id = tripId;
    if (kind === "revision") value.graph.itinerary_events[0].semantic_revision++;
    if (kind === "other-family") value.graph.itinerary_events[0].experience_family = "P5";
    if (kind === "inactive") value.actor.active = false;
    if (kind === "uncertified") value.certificate = null as never;
    f.accepted.mockResolvedValue(value);
    await expect(run()).rejects.toThrow("CORE_FRESH_ACCEPTED_EDIT_UNAVAILABLE");
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  },
);
it("removed current target does not swallow original lost-response receipt recovery", async () => {
  f.accepted.mockResolvedValue(null);
  f.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: operationId,
    receipt: { outcome: "APPLIED", operationId },
  });
  await run();
  expect(f.apply).toHaveBeenCalledOnce();
  expect(f.capabilities).not.toHaveBeenCalled();
  expect(f.accepted).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
  expect(f.refresh).toHaveBeenCalledOnce();
});
it("receipt 503 remains UNKNOWN; neither capability fallback nor replacement POST", async () => {
  f.receipt.mockRejectedValue(
    Object.assign(new Error("STATUS_UNAVAILABLE"), { status: 503, kind: "http" }),
  );
  await expect(run()).rejects.toThrow("STATUS_UNAVAILABLE");
  expect(f.state).toBe("IN_FLIGHT");
  expect(f.capabilities).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
  expect(f.apply).not.toHaveBeenCalled();
});
it("closed current normal profile forbids new POST before the local consumer guard", async () => {
  f.capabilities.mockResolvedValue(coreClosedCapabilities);
  await expect(run()).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(f.accepted).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});

it("a cloud summary row with no local Create identity cannot bypass the P6 POST gate", async () => {
  f.first.mockResolvedValue({ create_operation_id: null });
  f.accepted.mockResolvedValue(snapshot("P5"));
  await expect(run()).rejects.toThrow("CORE_FRESH_ACCEPTED_EDIT_UNAVAILABLE");
  expect(f.submit).not.toHaveBeenCalled();
});

it.each(["P3", "P4"])(
  "fresh own %s new POST and APPLIED refresh use original Worker with current normal capability",
  async (family) => {
    f.accepted.mockResolvedValue(snapshot(family));
    f.capabilities.mockResolvedValue({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledCommands: ["SET_ITEM_TEXT"],
      enabledAdmissionModes: ["MANUAL"],
      enabledFamilies: [family],
    });
    await run();
    expect(f.receipt).toHaveBeenCalledBefore(f.capabilities);
    expect(f.submit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId, tripId }),
      f.command,
    );
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(await f.choose!(tripId, itemId, family)).toBe(true);
  },
);

it.each([
  ["P3", "SET_RENTAL_DETAILS", { details: { supplier: "Wrong family" }, places: {} }],
  ["P4", "SET_STAY_DETAILS", { details: { property_name: "Wrong family" }, rooms: [] }],
] as const)(
  "current %s does not POST foreign subtype command %s",
  async (family, command, payload) => {
    f.command.command = command;
    f.command.payload = payload;
    f.operation.payloadJson = JSON.stringify(f.command);
    f.accepted.mockResolvedValue(snapshot(family));
    f.capabilities.mockResolvedValue({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledCommands: [command],
      enabledAdmissionModes: ["MANUAL"],
      enabledFamilies: [family],
    });
    await expect(run()).rejects.toThrow("CORE_FRESH_ACCEPTED_EDIT_UNAVAILABLE");
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  },
);

async function prepareInstructionCoordinator() {
  const { emptyCoreGraph, applyCoreCommand } =
    await import("@/domain/trip/tripCoreV2Mutation");
  const { coreDefaults } = await import("@/domain/trip/tripCoreV2");
  const { coreDateBoundary } = await import("@/domain/trip/tripCoreV2Temporal");
  const actor = {
    accountId,
    tripId,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: "10000000-0000-4000-8000-000000000008",
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P3",
        core: { title: "QA stay" },
        schedule: {
          start: coreDateBoundary("2026-11-05"),
          end: coreDateBoundary("2026-11-07"),
        },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2026-11-05T00:00:00Z",
  ).graph;
  const entry = "10000000-0000-4000-8000-000000000007";
  f.command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId,
    tripId,
    command: "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entry },
    baseVector: [
      { kind: "INSTRUCTION", id: entry, revision: null },
      { kind: "ITEM", id: itemId, revision: 1 },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      itemId,
      section: "ARRIVAL",
      body: "Ring reception",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
  };
  f.operation = {
    ...f.operation,
    entityId: entry,
    payloadJson: JSON.stringify(f.command),
  };
  f.accepted.mockResolvedValue({ graph, actor, certificate: { complete: 1 } });
  f.capabilities.mockResolvedValue({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: ["APPEND_INSTRUCTION"],
    enabledAdmissionModes: ["MANUAL"],
    enabledFamilies: ["P3"],
  });
}
const runInstruction = () =>
  createNativeNormalTripSyncRunner(
    { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
    () => true,
    false,
    () => true,
  )("AUTHENTICATED_ONLINE");
it("normal Coordinator keeps new Instruction dispatch off by default", async () => {
  await prepareInstructionCoordinator();
  await expect(run()).rejects.toThrow("CORE_INSTRUCTION_SYNC_CLOSED");
  expect(f.submit).not.toHaveBeenCalled();
});
it("normal Coordinator resolves the actual P3 parent for guarded submit without replacing the true target", async () => {
  await prepareInstructionCoordinator();
  await runInstruction();
  expect(await f.parent!(tripId, f.command)).toEqual({
    parentItemId: itemId,
    family: "P3",
    section: "ARRIVAL",
  });
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, tripId }),
    f.command,
  );
  expect(f.command.target.kind).toBe("INSTRUCTION");
  expect(f.command.target.id).not.toBe(itemId);
});
it("normal Coordinator keeps dependent mixed-batch Instruction behind an earlier parent mutation", async () => {
  await prepareInstructionCoordinator();
  // Capture the normal consumer callbacks without starting a new instruction POST.
  f.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: operationId,
    receipt: { outcome: "APPLIED" },
  });
  await runInstruction();
  f.pendingRows = [
    {
      command: {
        ...f.command,
        operationId: "10000000-0000-4000-8000-000000000009",
        command: "SET_ITEM_TEXT",
        payload: { title: "Predecessor edit" },
        target: { kind: "ITEM", id: itemId },
        baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
      },
      state: "IN_FLIGHT",
    },
    { command: f.command, state: "PENDING" },
  ];
  expect(await f.ready!(tripId, f.command)).toBe(false);
});
it("normal Coordinator preserves Instruction receipt-first recovery after parent removal and a closed integration switch", async () => {
  await prepareInstructionCoordinator();
  f.accepted.mockResolvedValue(null);
  f.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: operationId,
    receipt: { operationId, outcome: "APPLIED" },
  });
  await run();
  expect(f.accepted).not.toHaveBeenCalled();
  expect(f.capabilities).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
  expect(f.apply).toHaveBeenCalledOnce();
});
