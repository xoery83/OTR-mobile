import * as queueModule from "./syncOperationRepository";
import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import {
  createCoreV2SyncCoordinator,
  createCoreV2SyncWorker,
  createReviewedSourceOperationSync,
} from "./tripCoreV2SyncWorker";
import { coreClosedCapabilities } from "../../domain/trip/tripCoreV2Commands";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import type { CoreSyncTransport } from "./tripCoreV2SyncWorker";
import type { SyncOperation } from "./syncOperationRepository";
import { canonicalCoreJson, type Json } from "../../domain/trip/tripCoreV2Json";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
const actor = randomUUID(),
  trip = randomUUID(),
  id = randomUUID(),
  op = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: op,
    tripId: trip,
    command: "CREATE_SPARSE_FLIGHT",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      flightNumberLiteral: "NZ5069",
      departureDate: "2026-12-14",
      ...coreDefaults("member"),
    },
  };
  const ctx = await captureAccountRequestContext(trip, async () => actor),
    applyReceipt = vi.fn();
  const repo = {
    captureContext: async () => ctx,
    pending: async () => [{ command }],
    applyReceipt,
  } as unknown as ReturnType<typeof createTripCoreV2Repository>;
  const transport = {
    capabilities: vi.fn(async () => coreClosedCapabilities),
    receipt: vi.fn(async () => null),
    submit: vi.fn(),
  } as unknown as CoreSyncTransport;
  const operation = {
    id: op,
    tripId: trip,
    entityType: "TRIP_CORE_V2",
    entityId: id,
    operationType: "CORE_V2_COMMAND",
    idempotencyKey: op,
    payloadJson: canonicalCoreJson(command as unknown as Json),
    ownerUserId: actor,
  } as SyncOperation;
  return {
    worker: createCoreV2SyncWorker(repo, transport, async () => actor, hash),
    repo,
    transport,
    operation,
    applyReceipt,
  };
}
it("does not dispatch a durable command when negotiation remains CLOSED", async () => {
  const f = await fixture();
  await expect(f.worker.push(f.operation)).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(f.transport.submit).not.toHaveBeenCalled();
  expect(f.applyReceipt).not.toHaveBeenCalled();
});
it("looks up lost-response receipt before new capability admission and never redispatches", async () => {
  const f = await fixture(),
    receipt = { operationId: op };
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt,
  } as never);
  await f.worker.push(f.operation);
  expect(f.transport.capabilities).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
  expect(f.applyReceipt).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: actor, tripId: trip }),
    receipt,
  );
});
it("withholds redacted replay without fabricating accepted local facts", async () => {
  const f = await fixture();
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "STATUS_ONLY",
    domainReceiptId: randomUUID(),
    receiptSha256: "a".repeat(64),
    operationId: op,
    outcome: "APPLIED",
    targetRevision: null,
  });
  await expect(f.worker.push(f.operation)).rejects.toThrow(
    "CORE_CURRENT_AUTHORIZATION_REQUIRED",
  );
  expect(f.applyReceipt).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
});
it("rejects queue identity/intent mismatch before touching the network", async () => {
  const f = await fixture();
  await expect(f.worker.push({ ...f.operation, id: randomUUID() })).rejects.toThrow(
    "CORE_QUEUE_BINDING_MISMATCH",
  );
  expect(f.transport.receipt).not.toHaveBeenCalled();
});
it("rejects another account's operation and old Capture operation types", async () => {
  const f = await fixture();
  await expect(
    f.worker.push({ ...f.operation, ownerUserId: randomUUID() }),
  ).rejects.toThrow("CORE_ACCOUNT_CHANGED");
  await expect(
    f.worker.push({ ...f.operation, operationType: "C_EXECUTE_EVENT_SLOT" }),
  ).rejects.toThrow("CORE_UNSUPPORTED_QUEUE_OPERATION");
  expect(f.transport.receipt).not.toHaveBeenCalled();
});

it("exact Core target wakes and executes only that operation, retaining other same-Trip commands", async () => {
  const f = await fixture(),
    other = { ...f.operation, id: randomUUID() };
  const context = await f.repo.captureContext(trip);
  const resume = vi.fn();
  f.repo.resume = resume;
  const queue = {
    listPending: vi.fn().mockResolvedValue([f.operation, other]),
    markProcessing: vi.fn(),
    markCompleted: vi.fn(),
  };
  const push = vi.fn();
  await createCoreV2SyncCoordinator(
    queue as never,
    { push },
    f.repo,
    trip,
    f.operation.id,
  ).run("AUTHENTICATED_ONLINE");
  expect(resume).toHaveBeenCalledExactlyOnceWith(context, f.operation.id);
  expect(push).toHaveBeenCalledExactlyOnceWith(f.operation);
  expect(queue.markCompleted).toHaveBeenCalledExactlyOnceWith(f.operation.id);
});

async function sourceFixture(family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" = "P1") {
  const f = await fixture(),
    { universalP1SourceFixture } =
      await import("../../../backend/src/__fixtures__/universalP1Source"),
    source = await universalP1SourceFixture(
      actor,
      trip,
      "2026-11-03",
      family === "P3" || family === "P4" || family === "P5" || family === "P6"
        ? family
        : "P1",
    ),
    proposal = await (family === "P4" || family === "P5" || family === "P6"
      ? (Object.assign(source.input.selection, {
          sourceReview: {
            version:
              family === "P6"
                ? "otr.universal.p6-source-review/1"
                : family === "P5"
                  ? "otr.universal.p5-source-review/1"
                  : "otr.universal.p4-source-review/1",
            decision: "NEW",
            sourceRevision: 1,
            title:
              family === "P6"
                ? "Harbour QA Gallery Visit"
                : family === "P5"
                  ? "Coastal QA Train"
                  : "海滨租车",
            localDate: "2026-11-03",
            ...(family === "P4" ? { endLocalDate: "2026-11-05" } : {}),
            originalReviewed: true,
            tripReviewed: true,
          },
        }),
        source.run())
      : source.run()),
    slot = proposal.body.plan.slots[0];
  const command = {
    contractVersion: 2 as const,
    intentVersion: 2 as const,
    operationId: op,
    tripId: trip,
    command:
      family === "P2" ? ("CREATE_SPARSE_FLIGHT" as const) : ("CREATE_ITEM" as const),
    target: { kind: "ITEM" as const, id },
    baseVector: [{ kind: "ITEM" as const, id, revision: null }],
    admission: {
      mode: "REVIEWED_SOURCE" as const,
      sourceIntentId: slot.slotId,
      policyVersion: null,
    },
    payload:
      family === "P2"
        ? {
            flightNumberLiteral: "NZ501",
            departureDate: "2026-11-02",
            ...coreDefaults("member"),
          }
        : slot.payload,
  };
  f.repo.pending = vi.fn(async () => [{ command }] as never);
  const operation = { ...f.operation, payloadJson: canonicalCoreJson(command as Json) },
    domainReceiptId = randomUUID(),
    receipt = {
      operationId: op,
      outcome: "APPLIED",
      intentSha256: "a".repeat(64),
      receiptSha256: "b".repeat(64),
    };
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "FULL",
    domainReceiptId,
    receipt,
  } as never);
  f.transport.finalizeSourceOperation = vi.fn(async () => ({
    captureVersion: 2 as const,
    slotId: slot.slotId,
    state: "COMPLETE" as const,
    errorCode: null,
  }));
  return { ...f, operation, slot, receipt, domainReceiptId };
}
it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "recovers the same accepted %s operation and finishes its Source relation without redispatch",
  async (family) => {
    const f = await sourceFixture(family);
    await f.worker.push(f.operation);
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.repo.pending).toHaveBeenCalledWith(expect.anything(), op);
    expect(f.transport.finalizeSourceOperation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId: actor, tripId: trip }),
      {
        captureVersion: 2,
        slotId: f.slot.slotId,
        operationId: op,
        intentSha256: f.receipt.intentSha256,
        domainReceiptId: f.domainReceiptId,
        receiptSha256: f.receipt.receiptSha256,
      },
    );
  },
);
it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "retains accepted %s intent through Source finalization failure and retries only the relation",
  async (family) => {
    const f = await sourceFixture(family);
    vi.mocked(f.transport.finalizeSourceOperation!).mockRejectedValueOnce(
      Error("network lost"),
    );
    await expect(f.worker.push(f.operation)).rejects.toThrow("network lost");
    await f.worker.push(f.operation);
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.transport.finalizeSourceOperation).toHaveBeenCalledTimes(2);
  },
);

it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "never resubmits an APPLIED Source %s when its owning receipt cannot be read",
  async (family) => {
    const f = await sourceFixture(family);
    vi.mocked(f.repo.pending).mockResolvedValue([
      { command: JSON.parse(f.operation.payloadJson), state: "APPLIED" },
    ] as never);
    vi.mocked(f.transport.receipt).mockResolvedValue(null);
    await expect(f.worker.push(f.operation)).rejects.toThrow(
      "CORE_ACCEPTED_RECEIPT_UNAVAILABLE",
    );
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect(f.transport.capabilities).not.toHaveBeenCalled();
    expect(f.transport.finalizeSourceOperation).not.toHaveBeenCalled();
  },
);

it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "dispatches only the prepared %s Source operation with Manual QA scope closed",
  async (family) => {
    const f = await sourceFixture(family),
      context = await f.repo.captureContext(trip);
    f.repo.resume = vi.fn();
    vi.mocked(f.transport.receipt).mockResolvedValue(null);
    vi.mocked(f.transport.capabilities).mockResolvedValue({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledCommands: [family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM"],
      enabledFamilies: [family],
      enabledAdmissionModes: ["REVIEWED_SOURCE"],
      sourceEvidenceAvailable: true,
    });
    vi.mocked(f.transport.submit).mockResolvedValue({
      projection: "FULL",
      domainReceiptId: f.domainReceiptId,
      receipt: f.receipt,
    } as never);
    const queue = {
      listPending: vi.fn(async () => [f.operation, { ...f.operation, id: randomUUID() }]),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
    };
    const factory = vi
      .spyOn(queueModule, "createSyncOperationRepository")
      .mockReturnValue(queue as never);
    vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_TRIP_QA_SCOPE", "malformed");
    try {
      await createReviewedSourceOperationSync(
        {} as never,
        f.repo,
        f.transport,
        async () => actor,
        hash,
      )(context, op);
      expect(factory).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        expect.any(Function),
        undefined,
        { accountId: actor, tripId: trip, operationId: op },
      );
      expect(f.transport.submit).toHaveBeenCalledOnce();
      expect(f.transport.finalizeSourceOperation).toHaveBeenCalledOnce();
      expect(queue.markCompleted).toHaveBeenCalledExactlyOnceWith(op);
      expect(process.env.EXPO_PUBLIC_OTR_NATIVE_TRIP_QA_SCOPE).toBe("malformed");
    } finally {
      factory.mockRestore();
      vi.unstubAllEnvs();
    }
  },
);
it.each(["manual", "operation", "trip", "account", "target"])(
  "refuses %s mismatch before selecting a Source queue",
  async (reason) => {
    const f = reason === "manual" ? await fixture() : await sourceFixture("P3");
    if (reason === "target") {
      const pending = await f.repo.pending(await f.repo.captureContext(trip));
      (pending[0].command.target as { kind: string }).kind = "PERSON";
    }
    const context = await f.repo.captureContext(trip),
      factory = vi.spyOn(queueModule, "createSyncOperationRepository");
    try {
      await expect(
        createReviewedSourceOperationSync(
          {} as never,
          f.repo,
          f.transport,
          async () => (reason === "account" ? randomUUID() : actor),
          hash,
        )(
          reason === "trip" ? { ...context, tripId: randomUUID() } : context,
          reason === "operation" ? randomUUID() : op,
        ),
      ).rejects.toThrow();
      expect(factory).not.toHaveBeenCalled();
      expect(f.transport.submit).not.toHaveBeenCalled();
    } finally {
      factory.mockRestore();
    }
  },
);

it("retains a safe receipt-read phase without changing the error or sending a command", async () => {
  const f = await fixture();
  const error = Object.assign(new Error("OTR API read is unavailable."), {
    kind: "http",
    status: 503,
  });
  vi.mocked(f.transport.receipt).mockRejectedValue(error);
  await expect(f.worker.push(f.operation)).rejects.toBe(error);
  expect(error.message).toContain("CORE_RECEIPT_READ [http/503]");
  expect(f.transport.capabilities).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
});

it("distinguishes capability read failure after an absent receipt and never submits", async () => {
  const f = await fixture();
  const error = Object.assign(new Error("OTR API read is unavailable."), {
    kind: "timeout",
  });
  vi.mocked(f.transport.capabilities).mockRejectedValue(error);
  await expect(f.worker.push(f.operation)).rejects.toBe(error);
  expect(error.message).toContain("CORE_CAPABILITIES_READ [timeout/none]");
  expect(f.transport.submit).not.toHaveBeenCalled();
});

it("keeps a non-writable error message from replacing the original failure", async () => {
  const f = await fixture();
  const error = new Error("read unavailable");
  Object.defineProperty(error, "message", { writable: false });
  expect(Object.isFrozen(error)).toBe(false);
  vi.mocked(f.transport.receipt).mockRejectedValue(error);
  await expect(f.worker.push(f.operation)).rejects.toBe(error);
  expect(f.transport.submit).not.toHaveBeenCalled();
});

it("identifies command submission errors even when the client calls them read errors", async () => {
  const f = await fixture();
  vi.mocked(f.transport.capabilities).mockResolvedValue({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: ["CREATE_SPARSE_FLIGHT"],
    enabledAdmissionModes: ["MANUAL"],
    enabledFamilies: ["P2"],
  });
  const error = Object.assign(new Error("OTR API read is unavailable."), {
    kind: "http",
    status: 400,
  });
  vi.mocked(f.transport.submit).mockRejectedValue(error);
  await expect(f.worker.push(f.operation)).rejects.toBe(error);
  expect(error.message).toContain("CORE_SUBMIT [http/400]");
  expect(f.transport.submit).toHaveBeenCalledTimes(1);
});

it("negotiates Reviewed Source against its exact durable operation", async () => {
  const f = await sourceFixture("P1");
  vi.mocked(f.transport.receipt).mockResolvedValue(null);
  await expect(f.worker.push(f.operation)).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(f.transport.capabilities).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: actor, tripId: trip }),
    op,
  );
});

it.each(["SPARSE", "QUALIFIED", "P5", "Service", "ActiveBooking"])(
  "authored Flight worker requires own SPARSE P2 under exact Manual capability (%s)",
  async (kind) => {
    const f = await fixture();
    const { coreDateBoundary } = await import("../../domain/trip/tripCoreV2Temporal");
    const command = {
      ...JSON.parse(f.operation.payloadJson),
      command: "SET_AUTHORED_FLIGHT_DETAILS",
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
      payload: {
        flightNumberLiteral: "NZ5069",
        origin: {
          airportCode: "AKL",
          name: "Auckland",
          terminal: null,
          time: coreDateBoundary("2026-12-14"),
        },
        destination: {
          airportCode: null,
          name: null,
          terminal: null,
          time: { ...coreDateBoundary("2026-12-14"), local_date: null },
        },
      },
    };
    f.operation.payloadJson = canonicalCoreJson(command as Json);
    f.repo.pending = async () => [{ command }] as never;
    f.repo.readGraph = async () =>
      ({
        itinerary_events: [
          {
            id,
            experience_family: kind === "P5" ? "P5" : "P2",
            owner_account_id: actor,
          },
        ],
        itinerary_transport_services: kind === "Service" ? [{ event_id: id }] : [],
        trip_booking_item_links:
          kind === "ActiveBooking" ? [{ item_id: id, active: true }] : [],
        trip_flight_intents: [
          { event_id: id, qualification: kind === "P5" ? "SPARSE" : kind },
        ],
      }) as never;
    vi.mocked(f.transport.capabilities).mockResolvedValue({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledFamilies: ["P2"],
      enabledCommands: ["SET_AUTHORED_FLIGHT_DETAILS"],
      enabledAdmissionModes: ["MANUAL"],
    });
    vi.mocked(f.transport.submit).mockResolvedValue({
      projection: "FULL",
      receipt: { outcome: "APPLIED" },
    } as never);
    if (kind === "SPARSE")
      await expect(f.worker.push(f.operation)).resolves.toBeUndefined();
    else await expect(f.worker.push(f.operation)).rejects.toThrow("CORE_FAMILY_CLOSED");
    expect(f.transport.submit).toHaveBeenCalledTimes(kind === "SPARSE" ? 1 : 0);
    expect(f.transport.finalizeSourceOperation).toBeUndefined();
  },
);

async function instructionWorkerFixture(
  name: "APPEND_INSTRUCTION" | "CORRECT_INSTRUCTION",
) {
  const f = await fixture();
  const { applyCoreCommand, emptyCoreGraph } =
    await import("../../domain/trip/tripCoreV2Mutation");
  const { coreDateBoundary } = await import("../../domain/trip/tripCoreV2Temporal");
  const currentActor = {
    accountId: actor,
    tripId: trip,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const manual = { mode: "MANUAL", sourceIntentId: null, policyVersion: null };
  const stamp = "2026-11-05T00:00:00Z";
  let graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: manual,
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
    currentActor,
    stamp,
  ).graph;
  const entryId = randomUUID(),
    newEntryId = randomUUID();
  const append = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: op,
    tripId: trip,
    command: "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entryId },
    baseVector: [
      { kind: "INSTRUCTION", id: entryId, revision: null },
      { kind: "ITEM", id, revision: 1 },
    ],
    admission: manual,
    payload: {
      itemId: id,
      section: "ARRIVAL",
      body: "Ring reception",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
  };
  if (name === "CORRECT_INSTRUCTION")
    graph = applyCoreCommand(
      graph,
      { ...append, operationId: randomUUID() },
      currentActor,
      stamp,
    ).graph;
  const command =
    name === "APPEND_INSTRUCTION"
      ? append
      : {
          ...append,
          command: name,
          baseVector: [
            { kind: "INSTRUCTION", id: entryId, revision: 1 },
            { kind: "INSTRUCTION", id: newEntryId, revision: null },
            { kind: "ITEM", id, revision: 2 },
          ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
          payload: {
            newEntryId,
            body: "Updated guidance",
            sensitivity: "NORMAL",
            acl: { visibility: "GROUP", people: [] },
          },
        };
  f.repo.pending = async () => [{ command }] as never;
  f.repo.acceptedSnapshot = vi
    .fn()
    .mockResolvedValue({ graph, actor: currentActor, certificate: { revision: 1 } });
  f.repo.manualInstructionEligibility = vi.fn().mockResolvedValue({ status: "UNPROVEN" });
  vi.mocked(f.transport.capabilities).mockResolvedValue({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: [name],
    enabledAdmissionModes: ["MANUAL"],
    enabledFamilies: ["P3"],
  });
  vi.mocked(f.transport.submit).mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt: { operationId: op },
  } as never);
  return {
    ...f,
    graph,
    command,
    operation: {
      ...f.operation,
      entityId: entryId,
      payloadJson: canonicalCoreJson(command as unknown as Json),
    },
    openWorker: createCoreV2SyncWorker(
      f.repo,
      f.transport,
      async () => actor,
      hash,
      () => true,
    ),
    closedWorker: createCoreV2SyncWorker(f.repo, f.transport, async () => actor, hash),
  };
}
it.each(["APPEND_INSTRUCTION", "CORRECT_INSTRUCTION"] as const)(
  "uses actual P3 parent family instead of skipping its disabled capability for %s",
  async (name) => {
    const f = await instructionWorkerFixture(name);
    vi.mocked(f.transport.capabilities).mockResolvedValue({
      ...coreClosedCapabilities,
      activationState: "ENABLED",
      enabledCommands: [name],
      enabledAdmissionModes: ["MANUAL"],
      enabledFamilies: ["P1"],
    });
    await expect(f.openWorker.push(f.operation)).rejects.toThrow("CORE_FAMILY_CLOSED");
    expect(f.transport.submit).not.toHaveBeenCalled();
  },
);
it("keeps Instruction submissions closed by default even when remote command capability is present", async () => {
  const f = await instructionWorkerFixture("APPEND_INSTRUCTION");
  await expect(f.closedWorker.push(f.operation)).rejects.toThrow(
    "CORE_INSTRUCTION_SYNC_CLOSED",
  );
  expect(f.transport.submit).not.toHaveBeenCalled();
});
it("resolves a typed APPEND against a coherent authorized precommand snapshot without changing its queue identity", async () => {
  const f = await instructionWorkerFixture("APPEND_INSTRUCTION");
  await f.openWorker.push(f.operation);
  expect(f.transport.submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: actor, tripId: trip }),
    f.command,
  );
  expect(f.operation.entityId).toBe(f.command.target.id);
  expect(f.operation.entityId).not.toBe(id);
});
it("blocks unresolved scope and optimistic post-command graphs without a second graph or rebase", async () => {
  const f = await instructionWorkerFixture("APPEND_INSTRUCTION");
  vi.mocked(f.repo.acceptedSnapshot).mockResolvedValue(null);
  await expect(f.openWorker.push(f.operation)).rejects.toThrow(
    "CORE_INSTRUCTION_SCOPE_UNRESOLVED",
  );
  const { applyCoreCommand } = await import("../../domain/trip/tripCoreV2Mutation");
  const a = {
    accountId: actor,
    tripId: trip,
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  vi.mocked(f.repo.acceptedSnapshot).mockResolvedValue({
    graph: applyCoreCommand(f.graph, f.command, a, "2026-11-05T00:00:00Z").graph,
    actor: a,
    certificate: {},
  } as never);
  await expect(f.openWorker.push(f.operation)).rejects.toThrow(
    "CORE_INSTRUCTION_SCOPE_UNRESOLVED",
  );
  expect(f.transport.submit).not.toHaveBeenCalled();
});
it("keeps unproven queued CORRECT blocked rather than treating resolved family as provenance", async () => {
  const f = await instructionWorkerFixture("CORRECT_INSTRUCTION");
  await expect(f.openWorker.push(f.operation)).rejects.toThrow(
    "CORE_INSTRUCTION_SYNC_CLOSED",
  );
  expect(f.repo.manualInstructionEligibility).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
});
it("recovers the original Instruction receipt before a closed new-submit gate or missing parent snapshot", async () => {
  const f = await instructionWorkerFixture("CORRECT_INSTRUCTION");
  const receipt = { operationId: op };
  vi.mocked(f.transport.receipt).mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt,
  } as never);
  await f.closedWorker.push(f.operation);
  expect(f.repo.acceptedSnapshot).not.toHaveBeenCalled();
  expect(f.transport.capabilities).not.toHaveBeenCalled();
  expect(f.transport.submit).not.toHaveBeenCalled();
  expect(f.applyReceipt).toHaveBeenCalledWith(expect.anything(), receipt);
});

it("leaves a reviewed relationship pending until the original Item and Document are read back", async () => {
  const f = await fixture();
  const document = randomUUID();
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: op,
    tripId: trip,
    command: "RECONCILE_ITEM_DOCUMENTS",
    target: { kind: "ITEM", id },
    baseVector: [
      { kind: "DOCUMENT", id: document, revision: 1 },
      { kind: "ITEM", id, revision: 1 },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { add: [document], remove: [] },
  };
  f.repo.pending = async () => [{ command }] as never;
  f.repo.readGraph = async () => ({ itinerary_events: [{ id, experience_family: "P2" }] }) as never;
  let metadataReadback = false;
  f.repo.acceptedSnapshot = async () => ({
    graph: {
      itinerary_events: [{ id, semantic_revision: 1 }],
      trip_operational_documents: metadataReadback ? [{ id: document, revision: 1 }] : [],
    },
  }) as never;
  f.repo.refresh = vi.fn();
  f.transport.collection = vi.fn();
  vi.mocked(f.transport.capabilities).mockResolvedValue({
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledCommands: ["RECONCILE_ITEM_DOCUMENTS"],
    enabledFamilies: ["P1"],
    enabledAdmissionModes: ["MANUAL"],
  });
  vi.mocked(f.transport.submit).mockResolvedValue({
    projection: "FULL", domainReceiptId: randomUUID(),
    receipt: { outcome: "APPLIED" },
  } as never);
  const operation = { ...f.operation, payloadJson: canonicalCoreJson(command) };
  await expect(f.worker.push(operation)).rejects.toThrow("CORE_DOCUMENT_DEPENDENCY_PENDING");
  expect(f.transport.submit).not.toHaveBeenCalled();
  metadataReadback = true;
  await f.worker.push(operation);
  expect(f.transport.submit).toHaveBeenCalledTimes(1);
  expect(f.transport.submit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    command: "RECONCILE_ITEM_DOCUMENTS", operationId: op,
  }));
});
