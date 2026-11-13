import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import {
  coreClosedCapabilities,
  validateCoreCommand,
  isNormalManualCoreCommand,
  type CoreCapabilities,
} from "../../domain/trip/tripCoreV2Commands";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { localImportDocumentId } from "../../domain/trip/universalImportIdentity";
import type { CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";
import {
  openUniversalV3Review,
  applyUniversalV3Batch,
  planUniversalV3Review,
  planUniversalV3Batch,
  projectUniversalV3SaveState,
  universalV3ReviewFields,
} from "./universalV3Review";

const native = vi.hoisted(() => ({
  account: vi.fn(),
  getTrip: vi.fn(),
  snapshot: vi.fn(),
  capabilities: vi.fn(),
  enqueue: vi.fn(),
  enqueueDocuments: vi.fn(),
  pending: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  receipt: vi.fn(),
  retainedReceipt: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireAdoptedUserId: native.account }));
vi.mock("../auth/localTripAccess", () => ({
  readLocalTripRepository: async () => ({ getTrip: native.getTrip }),
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => ({}) }));
vi.mock("../api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => ({
    capabilities: native.capabilities,
    receipt: native.receipt,
  }),
}));
vi.mock("../repositories/tripCoreV2Repository", () => ({
  createTripCoreV2Repository: () => ({
    refresh: async () => {},
    acceptedSnapshot: native.snapshot,
    pending: native.pending,
    retainedReceipt: native.retainedReceipt,
    enqueue: native.enqueue,
    enqueueConfirmedItemDocuments: native.enqueueDocuments,
  }),
}));

const stamp = "2026-11-10T02:00:00Z";
function fixture() {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: randomUUID(),
    personIds: [],
    active: true,
    canManageShared: false,
  };
  actor.personIds = [actor.personId!];
  const fileSha = "a".repeat(64);
  const candidate = {
    candidateId: randomUUID(),
    kind: "P1" as const,
    subtype: "ACTIVITY",
    fields: { "activity.name": "Rail museum", "activity.date": "2026-12-14" },
    documentIds: [localImportDocumentId(actor.accountId, actor.tripId, fileSha)],
  };
  const model = {
    batch: {
      accountId: actor.accountId,
      batchId: randomUUID(),
      jobId: randomUUID(),
      context: { tripPrior: { id: actor.tripId } },
    },
    inputs: [
      {
        kind: "DOCUMENT",
        originalFilename: "plan.pdf",
        declaredContentType: "application/pdf",
        contentSha256: fileSha,
        contentByteCount: 32,
        state: "ACCEPTED",
      },
    ],
  } as unknown as CaptureJobReadModel;
  const capabilities: CoreCapabilities = {
    ...coreClosedCapabilities,
    activationState: "ENABLED",
    enabledFamilies: ["P1"],
    enabledCommands: ["CREATE_ITEM", "SET_ITEM_TEXT"],
    enabledAdmissionModes: ["MANUAL"],
  };
  const existing = (id: string) => ({
    contractVersion: 2,
    intentVersion: 2,
    tripId: actor.tripId,
    operationId: randomUUID(),
    target: { kind: "ITEM", id },
    command: "CREATE_ITEM",
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: "Previously entered title" },
      schedule: { start: coreDateBoundary("2026-12-15") },
      ...coreDefaults("member"),
    },
  });
  const snapshot = (graph = emptyCoreGraph()): CoreAcceptedSnapshot =>
    ({ actor, graph }) as CoreAcceptedSnapshot;
  return { actor, candidate, model, capabilities, existing, snapshot };
}
it("keeps an authorized NEW when document capability is unavailable and binds independent metadata/link", () => {
  const f = fixture();
  const input = { ...f, snapshot: f.snapshot(), decision: { action: "NEW" as const } };
  const first = planUniversalV3Review(input);
  const repeated = planUniversalV3Review(input);
  expect(first).toEqual(repeated);
  expect(first.commands.map(({ command }) => command)).toEqual([
    "CREATE_ITEM",
    "CREATE_DOCUMENT_METADATA",
    "RECONCILE_ITEM_DOCUMENTS",
  ]);
  expect(first.commands[1].admission.mode).toBe("MANUAL");
  expect(first.commands[1].payload).toEqual({
    title: "plan.pdf",
    media_type: "application/pdf",
    byte_size: 32,
    sha256: "a".repeat(64),
  });
  expect(first.commands[2].baseVector).toContainEqual({
    id: first.targetId,
    kind: "ITEM",
    revision: 1,
  });
});
it("reuses one Document across two Items and changes only the explicit UPDATE title", () => {
  const f = fixture();
  const target = randomUUID();
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    f.existing(target),
    f.actor,
    stamp,
  ).graph;
  const initial = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(graph),
    decision: { action: "UPDATE", itemId: target, revision: 1 },
  });
  expect(initial.commands[0]).toMatchObject({
    command: "SET_ITEM_TEXT",
    payload: { title: "Rail museum" },
  });
  expect(initial.commands[2].baseVector).toContainEqual({
    id: target,
    kind: "ITEM",
    revision: 2,
  });
  const updated = initial.commands.reduce(
    (current, command) => applyCoreCommand(current, command, f.actor, stamp).graph,
    graph,
  );
  expect(updated.itinerary_events[0].start_local_date).toBe(
    graph.itinerary_events[0].start_local_date,
  );
  const other = randomUUID();
  const two = applyCoreCommand(updated, f.existing(other), f.actor, stamp).graph;
  const link = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(two),
    candidate: { ...f.candidate, candidateId: randomUUID() },
    decision: { action: "LINK", itemId: other, revision: 1 },
  });
  expect(link.commands.map(({ command }) => command)).toEqual([
    "RECONCILE_ITEM_DOCUMENTS",
  ]);
  expect(link.commands[0].payload).toMatchObject({
    add: f.candidate.documentIds,
    remove: [],
  });
  expect(() =>
    planUniversalV3Review({
      ...f,
      snapshot: f.snapshot(two),
      decision: { action: "UPDATE", itemId: target, revision: 1 },
    }),
  ).toThrow("UNIVERSAL_V3_REVIEW_CHANGED");
});
it("does not confuse an independently saved Item with unknown or rejected relationship", () => {
  const saved = { itemOutcome: "APPLIED" as const, itemReadback: true };
  expect(
    projectUniversalV3SaveState({
      ...saved,
      relationOutcome: null,
      relationReadback: false,
    }),
  ).toBe("ITEM_VERIFIED_RELATION_PENDING");
  expect(
    projectUniversalV3SaveState({
      ...saved,
      relationOutcome: "CONFLICT",
      relationReadback: false,
    }),
  ).toBe("ITEM_VERIFIED_RELATION_REVIEW");
  expect(
    projectUniversalV3SaveState({
      ...saved,
      relationOutcome: "APPLIED",
      relationReadback: false,
    }),
  ).toBe("ITEM_VERIFIED_RELATION_PENDING");
  expect(
    projectUniversalV3SaveState({
      ...saved,
      relationOutcome: "APPLIED",
      relationReadback: true,
    }),
  ).toBe("VERIFIED");
});

it.each(["P3", "P6"] as const)(
  "opens and queues MANUAL %s NEW on a historical local Trip with authoritative Core eligibility",
  async (kind) => {
    const f = fixture();
    const candidate = {
      ...f.candidate,
      kind,
      fields: { ...f.candidate.fields, "check_out.date": "2026-12-15" },
    };
    native.account.mockResolvedValue(f.actor.accountId);
    native.getTrip.mockResolvedValue({ syncFormatVersion: 1 });
    native.snapshot.mockResolvedValue(f.snapshot());
    native.capabilities.mockResolvedValue({ ...f.capabilities, enabledFamilies: [kind] });
    native.enqueueDocuments.mockClear();
    const review = await openUniversalV3Review(f.model);
    expect(review.actions(candidate).NEW).toBe(true);
    expect(await review.confirm(candidate, { action: "NEW" })).toBe("PENDING");
    expect(native.enqueueDocuments).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId: f.actor.accountId, tripId: f.actor.tripId }),
      expect.arrayContaining([
        expect.objectContaining({
          command: "CREATE_ITEM",
          admission: expect.objectContaining({ mode: "MANUAL" }),
        }),
        expect.objectContaining({ command: "RECONCILE_ITEM_DOCUMENTS" }),
      ]),
    );
  },
);

it.each([
  "closed",
  "no manual",
  "no create command",
  "no person",
  "wrong account",
  "different family",
  "unsupported P5",
] as const)(
  "rejects NEW before enqueue when the authoritative eligibility is %s",
  async (reason) => {
    const f = fixture();
    const kind: "P1" | "P5" | "P6" = reason === "unsupported P5" ? "P5" : "P6";
    const candidate = { ...f.candidate, kind };
    const actor = {
      ...f.actor,
      ...(reason === "no person" ? { personId: null } : {}),
      ...(reason === "wrong account" ? { accountId: randomUUID() } : {}),
    };
    native.account.mockResolvedValue(f.actor.accountId);
    native.getTrip.mockResolvedValue({ syncFormatVersion: 1 });
    native.snapshot.mockResolvedValue({ ...f.snapshot(), actor });
    native.capabilities.mockResolvedValue({
      ...f.capabilities,
      enabledFamilies: reason === "different family" ? ["P3"] : [kind],
      ...(reason === "closed" ? coreClosedCapabilities : {}),
      ...(reason === "no manual" ? { enabledAdmissionModes: [] } : {}),
      ...(reason === "no create command" ? { enabledCommands: ["SET_ITEM_TEXT"] } : {}),
    });
    native.enqueue.mockClear();
    native.enqueueDocuments.mockClear();
    const review = await openUniversalV3Review(f.model);
    expect(review.actions(candidate).NEW).toBe(false);
    await expect(review.confirm(candidate, { action: "NEW" })).rejects.toThrow();
    expect(native.enqueue).not.toHaveBeenCalled();
    expect(native.enqueueDocuments).not.toHaveBeenCalled();
  },
);

const allFamilies = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
it.each(allFamilies)(
  "normal %s NEW is identical for cloud and locally-created Trips",
  async (kind) => {
    const f = fixture();
    const candidate = {
      ...f.candidate,
      kind,
      subtype: kind === "P5" ? "TRAIN" : "ACTIVITY",
      fields: {
        ...f.candidate.fields,
        "check_out.date": "2026-12-15",
        "origin.local_date": "2026-12-14",
        "destination.local_date": "2026-12-15",
        "origin.place_label": "Auckland",
        "destination.place_label": "Wellington",
        "operator.name": "Synthetic Rail",
        "service.number": "R1",
        service: "Rail R1",
      },
    };
    native.account.mockResolvedValue(f.actor.accountId);
    native.snapshot.mockResolvedValue(f.snapshot());
    native.capabilities.mockResolvedValue({
      ...f.capabilities,
      enabledFamilies: [kind],
      enabledCommands: [
        "CREATE_ITEM",
        "CREATE_SPARSE_FLIGHT",
        "CREATE_DOCUMENT_METADATA",
        "RECONCILE_ITEM_DOCUMENTS",
      ],
    });
    for (const format of [undefined, 1, 2]) {
      native.getTrip.mockResolvedValue(format ? { syncFormatVersion: format } : null);
      const review = await openUniversalV3Review(f.model);
      expect(review.actions(candidate).NEW).toBe(true);
      const plan = planUniversalV3Review({
        model: f.model,
        candidate,
        snapshot: f.snapshot(),
        capabilities: await native.capabilities(),
        decision: { action: "NEW" },
      });
      expect(plan.commands[0].command).toBe(
        kind === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM",
      );
      expect(plan.commands.at(-1)?.command).toBe("RECONCILE_ITEM_DOCUMENTS");
    }
  },
);
it.each(allFamilies)("incomplete %s NEW stays closed before queueing", async (kind) => {
  const f = fixture();
  native.account.mockResolvedValue(f.actor.accountId);
  native.snapshot.mockResolvedValue(f.snapshot());
  native.capabilities.mockResolvedValue({
    ...f.capabilities,
    enabledFamilies: [kind],
    enabledCommands: ["CREATE_ITEM", "CREATE_SPARSE_FLIGHT"],
  });
  const review = await openUniversalV3Review(f.model);
  expect(review.actions({ ...f.candidate, kind, fields: {} }).NEW).toBe(false);
});

it.each(allFamilies)(
  "%s LINK uses an existing canonical Item without an Import receipt",
  (kind) => {
    const f = fixture();
    const candidate = { ...f.candidate, kind };
    const graph = emptyCoreGraph();
    const item = randomUUID();
    graph.itinerary_events.push({
      id: item,
      trip_id: f.actor.tripId,
      owner_account_id: f.actor.accountId,
      experience_family: kind,
      semantic_revision: 4,
      visibility: "PRIVATE",
    } as never);
    const plan = planUniversalV3Review({
      model: f.model,
      candidate,
      snapshot: f.snapshot(graph),
      capabilities: { ...f.capabilities, enabledFamilies: [kind] },
      decision: { action: "LINK", itemId: item, revision: 4 },
    });
    expect(plan.commands.map((command) => command.command)).toEqual([
      "CREATE_DOCUMENT_METADATA",
      "RECONCILE_ITEM_DOCUMENTS",
    ]);
    expect(plan.targetId).toBe(item);
    expect(plan.commands.at(-1)?.baseVector).toContainEqual({
      kind: "ITEM",
      id: item,
      revision: 4,
    });
  },
);

it("uses Core's open-ended P4 contract without inventing a return date", () => {
  const f = fixture();
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(),
    candidate: { ...f.candidate, kind: "P4" },
    capabilities: { ...f.capabilities, enabledFamilies: ["P4"] },
    decision: { action: "NEW" },
  });
  expect(
    (plan.commands[0].payload as { schedule: { end?: unknown } }).schedule.end,
  ).toBeUndefined();
});
it("does not invent missing P5 service facts", () => {
  const f = fixture();
  expect(() =>
    planUniversalV3Review({
      ...f,
      snapshot: f.snapshot(),
      candidate: {
        ...f.candidate,
        kind: "P5",
        subtype: "TRAIN",
        fields: {
          ...f.candidate.fields,
          "origin.local_date": "2026-12-14",
          "destination.local_date": "2026-12-15",
          "origin.place_label": "Auckland",
          "destination.place_label": "Wellington",
        },
      },
      capabilities: { ...f.capabilities, enabledFamilies: ["P5"] },
      decision: { action: "NEW" },
    }),
  ).toThrow();
});

it.each(["P1", "P3", "P4", "P5", "P6"] as const)(
  "preserves %s authored dates, clocks and places without inventing an instant",
  (kind) => {
    const f = fixture();
    const fields = {
      "activity.name": "Museum",
      "activity.date": "2026-12-14",
      "activity.time": "10:35",
      "activity.location": "Museum Square",
      "activity.venue": "Museum Square",
      "check_in.date": "2026-12-14",
      "check_in.time": "10:35",
      "check_out.date": "2026-12-15",
      "check_out.time": "11:20",
      "property.name": "Hotel",
      "property.address": "Hotel Road",
      "pickup.date": "2026-12-14",
      "pickup.time": "10:35",
      "pickup.place": "Rental Depot",
      "return.date": "2026-12-15",
      "return.time": "11:20",
      "return.place": "Return Depot",
      "rental.company": "Rental",
      "origin.local_date": "2026-12-14",
      "origin.local_time": "10:35",
      "origin.place_label": "Station A",
      "destination.local_date": "2026-12-15",
      "destination.local_time": "11:20",
      "destination.place_label": "Station B",
      "operator.name": "Rail",
      "service.number": "R1",
      service: "Rail R1",
    };
    const result = planUniversalV3Review({
      ...f,
      snapshot: f.snapshot(),
      candidate: {
        ...f.candidate,
        kind,
        subtype: kind === "P5" ? "TRAIN" : "ACTIVITY",
        fields,
      },
      capabilities: { ...f.capabilities, enabledFamilies: [kind] },
      decision: { action: "NEW" },
    });
    const payload = result.commands[0].payload as any;
    const time = kind === "P5" ? payload.endpoints.origin.time : payload.schedule.start;
    expect(time).toMatchObject({
      local_date: "2026-12-14",
      local_time: "10:35",
      instant: null,
      clock_precision: -1,
    });
    if (kind === "P5")
      expect(payload.endpoints.destination.time.local_time).toBe("11:20");
    else if (kind === "P4")
      expect(payload.places).toMatchObject({
        pickup: { authored_label: "Rental Depot" },
        return: { authored_label: "Return Depot" },
      });
    else
      expect(payload.place.authored_label).toBe(
        kind === "P3" ? "Hotel Road" : "Museum Square",
      );
  },
);
it("date-only facts remain genuinely date-only and malformed clocks are rejected", () => {
  const f = fixture();
  const plan = (fields: Record<string, string>) =>
    planUniversalV3Review({
      ...f,
      snapshot: f.snapshot(),
      candidate: { ...f.candidate, fields },
      decision: { action: "NEW" },
    });
  expect(
    (plan(f.candidate.fields).commands[0].payload as any).schedule.start.local_time,
  ).toBeNull();
  expect(() => plan({ ...f.candidate.fields, "activity.time": "25:30" })).toThrow();
});

it("preserves P2 flight facts through the existing authored command when enabled", () => {
  const f = fixture();
  const candidate = {
    ...f.candidate,
    kind: "P2" as const,
    subtype: "FLIGHT",
    fields: {
      flight_number: "NZ502",
      "origin.local_date": "2026-12-14",
      "origin.local_time": "09:35",
      "origin.airport_code": "AKL",
      "origin.place_label": "Auckland Airport",
      "destination.local_date": "2026-12-14",
      "destination.local_time": "10:40",
      "destination.airport_code": "WLG",
      "destination.place_label": "Wellington Airport",
    },
  };
  const result = planUniversalV3Review({
    ...f,
    candidate,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
    capabilities: {
      ...f.capabilities,
      enabledFamilies: ["P2"],
      enabledCommands: ["CREATE_SPARSE_FLIGHT", "SET_AUTHORED_FLIGHT_DETAILS"],
    },
  });
  expect(result.commands[1]).toMatchObject({
    command: "SET_AUTHORED_FLIGHT_DETAILS",
    baseVector: [{ revision: 1 }],
    payload: {
      flightNumberLiteral: "NZ502",
      origin: { airportCode: "AKL", time: { local_time: "09:35", instant: null } },
      destination: { airportCode: "WLG", time: { local_time: "10:40", instant: null } },
    },
  });
  expect(result.commands.at(-1)?.baseVector).toContainEqual({
    kind: "ITEM",
    id: result.targetId,
    revision: 2,
  });
  const graph = result.commands.reduce(
    (graph, command) => applyCoreCommand(graph, command, f.actor, stamp).graph,
    emptyCoreGraph(),
  );
  expect(graph.itinerary_events).toHaveLength(1);
  expect(graph.trip_item_document_links).toHaveLength(1);
});
it("keeps exact N-to-M document sets and never merges separate candidates", () => {
  const f = fixture();
  const secondSha = "b".repeat(64);
  const second = localImportDocumentId(f.actor.accountId, f.actor.tripId, secondSha);
  const model = {
    ...f.model,
    inputs: [...f.model.inputs, { ...f.model.inputs[0], contentSha256: secondSha }],
  } as CaptureJobReadModel;
  const candidate = { ...f.candidate, documentIds: [...f.candidate.documentIds, second] };
  const plan = (candidate: typeof f.candidate) =>
    planUniversalV3Review({
      ...f,
      model,
      candidate,
      snapshot: f.snapshot(),
      decision: { action: "NEW" },
    });
  const one = plan(candidate),
    two = plan({ ...candidate, candidateId: randomUUID(), documentIds: [second] });
  expect(one.targetId).not.toBe(two.targetId);
  expect((one.commands.at(-1)?.payload as any).add.sort()).toEqual(
    [...candidate.documentIds].sort(),
  );
  expect((two.commands.at(-1)?.payload as any).add).toEqual([second]);
  expect(plan(candidate)).toEqual(one);
});

it("shows supported flight airport codes even without extracted place names", () => {
  const f = fixture();
  expect(
    universalV3ReviewFields({
      ...f.candidate,
      kind: "P2",
      fields: {
        "origin.airport_code": "AKL",
        "destination.airport_code": "LHR",
      },
    }),
  ).toMatchObject({ place: "AKL", endPlace: "LHR" });
});

it("Slice 3 contract: unreviewed V3 NEW would be recorded as protected MANUAL facts", () => {
  const f = fixture();
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  const create = plan.commands[0];
  expect(create.admission).toEqual({
    mode: "MANUAL",
    sourceIntentId: null,
    policyVersion: null,
  });
  const applied = applyCoreCommand(emptyCoreGraph(), create, f.actor, stamp).graph;
  expect(applied.itinerary_events[0].field_state).toMatchObject({
    "itinerary_events.title": { origin: "MANUAL", protected: true },
  });
});
it("Slice 3 contract: source-free AUTO_SOURCE is rejected rather than silently admitted", () => {
  const f = fixture();
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  const admission = {
    mode: "AUTO_SOURCE",
    sourceIntentId: null,
    policyVersion: "otr.trip.auto-admit/1",
  };
  expect(() => validateCoreCommand({ ...plan.commands[0], admission })).toThrow(
    "INVALID_ADMISSION_BINDING",
  );
  const sourceBound = validateCoreCommand({
    ...plan.commands[0],
    admission: { ...admission, sourceIntentId: randomUUID() },
  });
  expect(isNormalManualCoreCommand(sourceBound)).toBe(false);
  expect(() => applyCoreCommand(emptyCoreGraph(), sourceBound, f.actor, stamp)).toThrow(
    "INVALID_PROVENANCE",
  );
  expect(() =>
    validateCoreCommand({
      ...plan.commands[1],
      admission: { ...admission, sourceIntentId: randomUUID() },
    }),
  ).toThrow("INVALID_PROVENANCE");
});
it("Slice 3 contract: IMPORT accepts only the newly approved finite commands", () => {
  const f = fixture();
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  expect(() =>
    validateCoreCommand({
      ...plan.commands[0],
      admission: { mode: "IMPORT", sourceIntentId: null, policyVersion: null },
    }),
  ).not.toThrow();
});

it.each(allFamilies)(
  "Slice 3 IMPORT %s NEW uses existing commands with non-manual provenance",
  (kind) => {
    const f = fixture();
    const candidate = {
      ...f.candidate,
      kind,
      subtype: kind === "P5" ? "TRAIN" : "ACTIVITY",
      fields: {
        title: kind === "P2" ? "NZ1" : "Synthetic trip object",
        "schedule.start.local_date": "2026-12-14",
        "schedule.end.local_date": "2026-12-15",
        "check_out.date": "2026-12-15",
        "origin.local_date": "2026-12-14",
        "destination.local_date": "2026-12-15",
        "origin.place_label": "Auckland",
        "destination.place_label": "Wellington",
        "operator.name": "Synthetic Rail",
        "service.number": "R1",
        service: "Rail R1",
      },
    };
    const capabilities: CoreCapabilities = {
      ...f.capabilities,
      enabledFamilies: [...allFamilies],
      enabledAdmissionModes: ["MANUAL", "IMPORT"],
      enabledCommands: [
        "CREATE_ITEM",
        "CREATE_SPARSE_FLIGHT",
        "CREATE_DOCUMENT_METADATA",
        "RECONCILE_ITEM_DOCUMENTS",
      ],
    };
    const plan = planUniversalV3Review({
      ...f,
      candidate,
      capabilities,
      snapshot: f.snapshot(),
      decision: { action: "NEW" },
      admissionMode: "IMPORT",
    });
    const graph = plan.commands.reduce(
      (g, c) => applyCoreCommand(g, c, f.actor, stamp, true).graph,
      emptyCoreGraph(),
    );
    expect(plan.commands.every((c) => c.admission.mode === "IMPORT")).toBe(true);
    expect(graph.itinerary_events[0].field_state).toMatchObject({
      "itinerary_events.title": { origin: "PROVIDER", protected: false },
    });
    expect(graph.trip_item_document_links).toHaveLength(1);
  },
);
it("Slice 3 IMPORT links evidence without overwriting an explicitly edited manual field", () => {
  const f = fixture(),
    target = randomUUID();
  const before = applyCoreCommand(
    emptyCoreGraph(),
    f.existing(target),
    f.actor,
    stamp,
  ).graph;
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(before),
    capabilities: { ...f.capabilities, enabledAdmissionModes: ["MANUAL", "IMPORT"] },
    decision: { action: "LINK", itemId: target, revision: 1 },
    admissionMode: "IMPORT",
  });
  const graph = plan.commands.reduce(
    (g, c) => applyCoreCommand(g, c, f.actor, stamp, true).graph,
    before,
  );
  expect(graph.itinerary_events[0].title).toBe("Previously entered title");
  expect(graph.itinerary_events[0].field_state).toEqual(
    before.itinerary_events[0].field_state,
  );
  expect(graph.trip_item_document_links).toHaveLength(1);
  expect(() =>
    validateCoreCommand({
      ...plan.commands.at(-1)!,
      command: "SET_ITEM_TEXT",
      baseVector: [{ kind: "ITEM", id: target, revision: 2 }],
      payload: { title: "Silent replacement" },
    }),
  ).toThrow("SCOPE_NOT_AUTHORIZED");
});

it("Slice 3 batch: complete NEW, missing facts, ABSTAIN and title ambiguity remain distinct", () => {
  const f = fixture(),
    capabilities = {
      ...f.capabilities,
      enabledAdmissionModes: [
        "MANUAL",
        "IMPORT",
      ] as CoreCapabilities["enabledAdmissionModes"],
    };
  const plan = (
    candidates: import("zod").z.infer<
      typeof import("../api/universalV3Contracts").universalV3Candidate
    >[],
    graph = emptyCoreGraph(),
  ) =>
    planUniversalV3Batch({
      model: f.model,
      candidates,
      snapshot: f.snapshot(graph),
      capabilities,
    });
  expect(plan([f.candidate])[0].disposition).toBe("NEW");
  expect(
    plan([{ ...f.candidate, fields: { "activity.name": "No date" } }])[0],
  ).toMatchObject({ disposition: "REVIEW", reason: "missing" });
  expect(plan([{ ...f.candidate, fields: {} }])[0].disposition).toBe("ABSTAIN");
  const existing = validateCoreCommand(f.existing(randomUUID()));
  const graph = applyCoreCommand(emptyCoreGraph(), existing, f.actor, stamp, true).graph;
  expect(
    plan(
      [
        {
          ...f.candidate,
          fields: {
            ...f.candidate.fields,
            "activity.name": "Previously entered title",
            "activity.date": "2026-12-15",
          },
        },
      ],
      graph,
    )[0],
  ).toMatchObject({ disposition: "REVIEW", reason: "ambiguous" });
  expect(
    plan([{ ...f.candidate, candidateId: randomUUID() }, f.candidate]).every(
      (row) => row.disposition === "REVIEW",
    ),
  ).toBe(true);
});
it("Slice 3 batch: stable supplier identity aggregates documents; conflicting facts require Review", () => {
  const f = fixture(),
    capabilities = {
      ...f.capabilities,
      enabledAdmissionModes: [
        "MANUAL",
        "IMPORT",
      ] as CoreCapabilities["enabledAdmissionModes"],
    };
  const first = {
    ...f.candidate,
    fields: {
      ...f.candidate.fields,
      confirmation_code: "ABC123",
      provider: "Example museum",
    },
  };
  const second = { ...first, candidateId: randomUUID() };
  const plan = planUniversalV3Batch({
    model: f.model,
    candidates: [first, second],
    snapshot: f.snapshot(),
    capabilities,
  });
  expect(plan).toHaveLength(1);
  expect(plan[0].members).toHaveLength(2);
  expect(plan[0].disposition).toBe("NEW");
  expect(
    planUniversalV3Batch({
      model: f.model,
      candidates: [
        first,
        { ...second, fields: { ...second.fields, "activity.date": "2026-12-16" } },
      ],
      snapshot: f.snapshot(),
      capabilities,
    })[0],
  ).toMatchObject({ disposition: "REVIEW", reason: "conflict" });
});

it("Slice 3 confirmed batch continues every independent eligible row and never dispatches UNKNOWN", async () => {
  const f = fixture();
  const candidates = [
    f.candidate,
    { ...f.candidate, candidateId: randomUUID() },
    { ...f.candidate, candidateId: randomUUID() },
  ];
  const check = vi.fn(async () => "UNCONFIRMED" as const),
    confirm = vi.fn(async () => "PENDING" as const);
  const owner = { check, confirm } as unknown as Awaited<
    ReturnType<typeof openUniversalV3Review>
  >;
  const intent = {
    version: 1 as const,
    accountId: f.actor.accountId,
    tripId: f.actor.tripId,
    batchId: f.model.batch.batchId,
    confirmed: true,
    confirmBeforeSave: true,
    resolutions: {},
  };
  const rows = candidates.map((candidate) => ({
    candidate,
    members: [candidate.candidateId],
    disposition: "NEW" as const,
    decision: { action: "NEW" as const },
  }));
  const first = applyUniversalV3Batch(
    f.model,
    owner,
    rows,
    intent,
    new Set([candidates[2].candidateId]),
  );
  expect(
    applyUniversalV3Batch(
      f.model,
      owner,
      rows,
      intent,
      new Set([candidates[2].candidateId]),
    ),
  ).toBe(first);
  const status = await first;
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(status[candidates[2].candidateId]).toBe("OUTCOME_UNKNOWN");
});
it("Slice 3 one failed plan cannot hold a separate eligible plan or broaden the original scope", async () => {
  const f = fixture();
  const second = { ...f.candidate, candidateId: randomUUID() };
  const owner = {
    check: vi.fn(async () => "UNCONFIRMED" as const),
    confirm: vi
      .fn()
      .mockRejectedValueOnce(Error("REVISION_CONFLICT"))
      .mockResolvedValueOnce("PENDING"),
  } as unknown as Awaited<ReturnType<typeof openUniversalV3Review>>;
  const intent = {
    version: 1 as const,
    accountId: f.actor.accountId,
    tripId: f.actor.tripId,
    batchId: f.model.batch.batchId,
    confirmed: true,
    confirmBeforeSave: false,
    resolutions: {},
  };
  const rows = [f.candidate, second].map((candidate) => ({
    candidate,
    members: [candidate.candidateId],
    disposition: "NEW" as const,
    decision: { action: "NEW" as const },
  }));
  expect(
    await applyUniversalV3Batch(f.model, owner, rows, intent, new Set()),
  ).toMatchObject({
    [f.candidate.candidateId]: "REVIEW_REQUIRED",
    [second.candidateId]: "PENDING",
  });
  await expect(
    applyUniversalV3Batch(
      f.model,
      owner,
      rows,
      { ...intent, tripId: randomUUID() },
      new Set(),
    ),
  ).rejects.toThrow("CONTEXT");
});

it("Slice 3 receipt readback uses one owning connection at a time", async () => {
  const f = fixture(),
    plan = planUniversalV3Review({
      ...f,
      snapshot: f.snapshot(),
      decision: { action: "NEW" },
    });
  const graph = plan.commands.reduce(
    (graph, command) => applyCoreCommand(graph, command, f.actor, stamp, true).graph,
    emptyCoreGraph(),
  );
  native.account.mockResolvedValue(f.actor.accountId);
  native.getTrip.mockResolvedValue({ syncFormatVersion: 1 });
  native.snapshot.mockResolvedValue(f.snapshot(graph));
  native.capabilities.mockResolvedValue(f.capabilities);
  native.pending.mockImplementation(async (_context, id) =>
    plan.commands
      .filter((command) => command.operationId === id)
      .map((command) => ({ command })),
  );
  let concurrent = 0,
    maximum = 0;
  native.receipt.mockImplementation(async () => {
    concurrent++;
    maximum = Math.max(maximum, concurrent);
    await new Promise((resolve) => setTimeout(resolve, 2));
    concurrent--;
    return { projection: "FULL", receipt: { outcome: "APPLIED" } };
  });
  try {
    expect(await (await openUniversalV3Review(f.model)).check(f.candidate)).toBe(
      "VERIFIED",
    );
    expect(maximum).toBe(1);
  } finally {
    native.pending.mockReset().mockResolvedValue([]);
    native.receipt.mockReset();
  }
});

it("Slice 3 one original keeps identical metadata across different candidate types", () => {
  const f = fixture();
  const model = {
    ...f.model,
    inputs: f.model.inputs.map((file) => ({ ...file, originalFilename: null })),
  };
  const first = planUniversalV3Review({
    ...f,
    model,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  const second = planUniversalV3Review({
    ...f,
    model,
    candidate: {
      ...f.candidate,
      candidateId: randomUUID(),
      kind: "P3",
      subtype: "HOTEL",
      fields: {
        title: "Hotel",
        "check_in.date": "2026-12-14",
        "check_out.date": "2026-12-15",
      },
    },
    capabilities: { ...f.capabilities, enabledFamilies: ["P3"] },
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  expect(first.commands.find((c) => c.command === "CREATE_DOCUMENT_METADATA")).toEqual(
    second.commands.find((c) => c.command === "CREATE_DOCUMENT_METADATA"),
  );
});
it("Slice 3 exact flight identity links a manually created Item without an Import Receipt", () => {
  const f = fixture();
  const candidate = {
    ...f.candidate,
    kind: "P2" as const,
    fields: {
      title: "AA1302",
      flight_number: "AA1302",
      "origin.airport_code": "LAX",
      "destination.airport_code": "SFO",
      "origin.local_date": "2026-12-20",
      "destination.local_date": "2026-12-20",
    },
  };
  const capabilities: CoreCapabilities = {
    ...f.capabilities,
    enabledFamilies: ["P2"],
    enabledAdmissionModes: ["MANUAL", "IMPORT"],
    enabledCommands: [
      "CREATE_SPARSE_FLIGHT",
      "SET_AUTHORED_FLIGHT_DETAILS",
      "CREATE_DOCUMENT_METADATA",
      "RECONCILE_ITEM_DOCUMENTS",
    ],
  };
  const manual = planUniversalV3Review({
    ...f,
    candidate,
    capabilities,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  const graph = manual.commands.reduce(
    (graph, c) => applyCoreCommand(graph, c, f.actor, stamp, true).graph,
    emptyCoreGraph(),
  );
  const linked = planUniversalV3Batch({
    model: f.model,
    candidates: [{ ...candidate, candidateId: randomUUID() }],
    snapshot: f.snapshot(graph),
    capabilities,
  });
  expect(linked[0]).toMatchObject({
    disposition: "LINK",
    decision: { action: "LINK", itemId: manual.targetId },
  });
  expect(graph.itinerary_events[0].field_state).toMatchObject({
    "itinerary_events.title": { origin: "MANUAL", protected: true },
  });
});

it("Slice 4 reads original reconciled operations by exact ID without enqueueing or using the current plan", async () => {
  const f = fixture();
  const plan = planUniversalV3Review({
    ...f,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
  });
  const command = plan.commands[0];
  native.account.mockResolvedValue(f.actor.accountId);
  native.getTrip.mockResolvedValue({ syncFormatVersion: 1 });
  native.snapshot.mockResolvedValue(f.snapshot());
  native.capabilities.mockResolvedValue(f.capabilities);
  native.pending.mockImplementation(async (_ctx: unknown, id: unknown) =>
    id === command.operationId
      ? [{ command, state: "APPLIED", reconciled_revision: 15 }]
      : [],
  );
  native.retainedReceipt.mockResolvedValue(null);
  native.enqueue.mockClear();
  native.enqueueDocuments.mockClear();
  const owner = await openUniversalV3Review(f.model);
  const facts = await owner.resultOperations([f.candidate]);
  expect(facts.operations).toHaveLength(1);
  expect(facts.operations[0].command.operationId).toBe(command.operationId);
  expect(native.pending).toHaveBeenCalledWith(expect.anything(), command.operationId);
  expect(native.enqueue).not.toHaveBeenCalled();
  expect(native.enqueueDocuments).not.toHaveBeenCalled();
});

it("UX-C2 TYPE-05 completes only genuinely missing facts, then uses the existing MANUAL Core contract", async () => {
  const { completeUniversalV3RequiredFields, universalV3MissingFields } =
    await import("./universalV3Review");
  const f = fixture();
  const missing = { ...f.candidate, fields: { "activity.name": "Rail museum" } };
  expect(universalV3MissingFields(missing).map((field) => field.key)).toEqual([
    "schedule.start.local_date",
  ]);
  expect(() =>
    completeUniversalV3RequiredFields(missing, {
      "schedule.start.local_date": "2026-02-30",
    }),
  ).toThrow();
  const completed = completeUniversalV3RequiredFields(missing, {
    "schedule.start.local_date": "2026-12-18",
    title: "Do not overwrite",
    "schedule.start.local_time": "00:00",
  });
  expect(universalV3ReviewFields(completed)).toMatchObject({
    title: "Rail museum",
    start: "2026-12-18",
    startTime: undefined,
  });
  const plan = planUniversalV3Review({
    ...f,
    candidate: completed,
    snapshot: f.snapshot(),
    decision: { action: "NEW" },
    admissionMode: "MANUAL",
  });
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    plan.commands[0],
    f.actor,
    stamp,
  ).graph;
  expect(graph.itinerary_events).toHaveLength(1);
  expect(graph.itinerary_events[0]).toMatchObject({
    title: "Rail museum",
    start_local_date: "2026-12-18",
    start_local_time: null,
  });
  expect(
    Object.values(
      graph.itinerary_events[0].field_state as Record<string, { origin: string }>,
    ).every((field) => field.origin === "MANUAL"),
  ).toBe(true);
  expect(plan.commands[0].operationId).toBe(
    planUniversalV3Review({
      ...f,
      candidate: completed,
      snapshot: f.snapshot(),
      decision: { action: "NEW" },
    }).commands[0].operationId,
  );
});
it("UX-C2 decision saved, offline waiting and UNKNOWN never resolve the owning Review", async () => {
  const { universalV3ReviewStatus: status } = await import("./universalV3Review");
  expect(status("UNCONFIRMED", true, false)).toBe("confirmation");
  expect(status("UNCONFIRMED", true, true)).toBe("waiting");
  expect(status("PENDING", true, true)).toBe("applying");
  expect(status("ITEM_VERIFIED_RELATION_PENDING", true, true)).toBe("applying");
  expect(status("OUTCOME_UNKNOWN", true, true)).toBe("unknown");
  expect(status("REVIEW_REQUIRED", true, true)).toBe("recheck");
  expect(status("VERIFIED", true, true)).toBe("resolved");
});
it("UX-C2 only a retained explicit manual completion selects MANUAL; automatic admission stays unchanged", async () => {
  const f = fixture(),
    check = vi.fn(async () => "UNCONFIRMED" as const),
    confirm = vi.fn(async () => "PENDING" as const);
  const owner = { check, confirm } as unknown as Awaited<
    ReturnType<typeof openUniversalV3Review>
  >;
  const row = {
    candidate: f.candidate,
    members: [f.candidate.candidateId],
    disposition: "REVIEW" as const,
    reason: "missing" as const,
  };
  const intent = {
    version: 1 as const,
    accountId: f.actor.accountId,
    tripId: f.actor.tripId,
    batchId: f.model.batch.batchId,
    confirmed: true,
    confirmBeforeSave: true,
    resolutions: {
      [f.candidate.candidateId]: {
        candidate: f.candidate,
        decision: { action: "NEW" as const },
        manual: true,
      },
    },
  };
  await applyUniversalV3Batch(f.model, owner, [row], intent, new Set());
  expect(confirm).toHaveBeenCalledWith(f.candidate, { action: "NEW" }, true);
  confirm.mockClear();
  await applyUniversalV3Batch(
    f.model,
    owner,
    [row],
    intent,
    new Set([f.candidate.candidateId]),
  );
  expect(confirm).not.toHaveBeenCalled();
});
it("UX-C2 actual Review owner uses MANUAL only for explicitly authored NEW and keeps the same operation IDs", async () => {
  const f = fixture();
  native.account.mockResolvedValue(f.actor.accountId);
  native.getTrip.mockResolvedValue({ syncFormatVersion: 1 });
  native.snapshot.mockResolvedValue(f.snapshot());
  native.capabilities.mockResolvedValue({
    ...f.capabilities,
    enabledAdmissionModes: ["IMPORT", "MANUAL"],
  });
  native.pending.mockResolvedValue([]);
  native.enqueueDocuments.mockClear();
  const review = await openUniversalV3Review(f.model, "IMPORT");
  expect(await review.confirm(f.candidate, { action: "NEW" }, true)).toBe("PENDING");
  expect(native.enqueueDocuments).toHaveBeenCalledWith(
    expect.anything(),
    expect.arrayContaining([
      expect.objectContaining({
        command: "CREATE_ITEM",
        admission: expect.objectContaining({ mode: "MANUAL" }),
      }),
    ]),
  );
  await expect(
    review.confirm(
      f.candidate,
      { action: "LINK", itemId: randomUUID(), revision: 1 },
      true,
    ),
  ).rejects.toThrow("REVIEW_CHANGED");
});
it("UX-C2 P5 requires its actual transport endpoint dates rather than accepting a generic date as an origin", async () => {
  const { universalV3MissingFields } = await import("./universalV3Review");
  const f = fixture();
  const keys = universalV3MissingFields({
    ...f.candidate,
    kind: "P5",
    fields: { title: "Train", "schedule.start.local_date": "2026-12-18" },
  }).map((field) => field.key);
  expect(keys).toContain("origin.local_date");
  expect(keys).toContain("destination.local_date");
  expect(keys).toContain("origin.place_label");
});
