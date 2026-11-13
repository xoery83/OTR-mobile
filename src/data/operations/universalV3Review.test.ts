import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import {
  coreClosedCapabilities,
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
  planUniversalV3Review,
  projectUniversalV3SaveState,
} from "./universalV3Review";

const native = vi.hoisted(() => ({
  account: vi.fn(),
  getTrip: vi.fn(),
  snapshot: vi.fn(),
  capabilities: vi.fn(),
  enqueue: vi.fn(),
  enqueueDocuments: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireAdoptedUserId: native.account }));
vi.mock("../auth/localTripAccess", () => ({
  readLocalTripRepository: async () => ({ getTrip: native.getTrip }),
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => ({}) }));
vi.mock("../api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => ({ capabilities: native.capabilities }),
}));
vi.mock("../repositories/tripCoreV2Repository", () => ({
  createTripCoreV2Repository: () => ({
    refresh: async () => {},
    acceptedSnapshot: native.snapshot,
    pending: async () => [],
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
    batch: { accountId: actor.accountId, context: { tripPrior: { id: actor.tripId } } },
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
