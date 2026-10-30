import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fixture, draftEntries } from "./guestAdoptionCompositePlan.fixture";
import {
  executeGuestAdoptionComposite,
  type GuestAdoptionCompositeTransaction,
} from "./guestAdoptionCompositeExecute";
import { emptyCoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { tripCreateWireResultSchema } from "../../src/domain/trip/tripCreateWireContract";
import { personCloudCreateReceiptSchema } from "../../src/domain/trip/tripPersonCloudCreate";
import {
  tripMetadataRevisionedReceiptSchema,
  tripMetadataRevisionedSnapshotSchema,
} from "../../src/domain/trip/tripMetadataV2Contract";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
afterEach(() => vi.useRealTimers());
const canonical = (v: unknown) => canonicalCoreJson(v as Json);
async function harness(change?: (f: ReturnType<typeof fixture>) => void, drafts = false) {
  const f = fixture();
  change?.(f);
  const entries = drafts ? draftEntries(f) : [];
  f.grant.resources.liveDrafts = entries.length;
  const checkpoint = await f.source(entries),
    staging = { grant: f.grant, preparationSha256: checkpoint.sha256 };
  const actor = f.user.id,
    owner = randomUUID(),
    calls: string[] = [];
  let state = {
    trips: {} as Record<string, ReturnType<typeof tripCreateWireResultSchema.parse>>,
    people: {} as Record<string, ReturnType<typeof personCloudCreateReceiptSchema.parse>>,
    graph: emptyCoreGraph(),
    receipts: {} as Record<string, { domainReceiptId: string; receiptText: string }>,
    metadata: {} as Record<
      string,
      { value: unknown; revision: number; structured: boolean }
    >,
  };
  const flags = {
    wrongLedger: false,
    wrongPerson: false,
    wrongMetadata: false,
    wrongReadback: false,
    coreError: "",
    redacted: false,
    wrongActor: false,
    afterCreate: () => {},
  };
  const transaction: GuestAdoptionCompositeTransaction = {
    async assertCurrent(b) {
      calls.push("AUTH");
      if (
        b.actorAccountId !== actor ||
        b.adoptionId !== f.grant.adoptionId ||
        b.inventorySha256 !== f.grant.inventorySha256
      )
        throw Error("AUTH_BINDING");
    },
    async assertNewTrips(a, ids) {
      calls.push("NEW");
      if (a !== actor || ids.some((id) => state.trips[id])) throw Error("TRIP_COLLISION");
    },
    trips: {
      async create(a, input) {
        calls.push("TRIP_CREATE");
        const result = tripCreateWireResultSchema.parse({
          ...input,
          ...("formatVersion" in input ? { metadataRevision: 0 } : {}),
          actorAccountId: a,
          ownerPersonId: owner,
          coreEpoch: randomUUID(),
          coreRevision: 1,
          coreAccessRevision: 1,
        });
        state.trips[input.tripId] = result;
        const { operationId: _op, tripId: _trip, ...fields } = input;
        const { formatVersion: _v, ...metadata } = fields as typeof fields & {
          formatVersion?: number;
        };
        state.metadata[input.tripId] = {
          value: metadata,
          revision: 0,
          structured: "formatVersion" in input,
        };
        flags.afterCreate();
        return result;
      },
      async receipt(a, operation) {
        calls.push("TRIP_READ");
        const found = Object.values(state.trips).find(
          (r) => r.operationId === operation && r.actorAccountId === a,
        );
        return found
          ? { ...found, ...(flags.wrongReadback ? { ownerPersonId: randomUUID() } : {}) }
          : null;
      },
    },
    people: {
      async create(a, request) {
        calls.push("PERSON_CREATE");
        const r = personCloudCreateReceiptSchema.parse({
          receiptVersion: 1,
          actorAccountId: flags.wrongPerson ? randomUUID() : a,
          request,
          person: {
            personId: request.personId,
            tripId: request.tripId,
            displayName: request.displayName,
            status: "unlinked",
            userId: null,
            participationActive: true,
            participationRevision: 0,
          },
          acceptedAt: new Date().toISOString(),
        });
        state.people[request.operationId] = r;
        return r;
      },
      async receipt(_a, _t, op) {
        calls.push("PERSON_READ");
        return state.people[op] ?? null;
      },
    },
    async initializeLedger(_a, original) {
      calls.push("LEDGER");
      return { ...original, ...(flags.wrongLedger ? { settlementCurrency: "USD" } : {}) };
    },
    metadata: {
      async snapshot(a, t) {
        calls.push("METADATA_READ");
        const m = state.metadata[t];
        return tripMetadataRevisionedSnapshotSchema.parse({
          formatVersion: m.structured ? 3 : 2,
          actorAccountId: a,
          tripId: t,
          metadataRevision: m.revision,
          metadata: m.value,
        });
      },
      async update(a, request) {
        calls.push("METADATA_WRITE");
        const m = state.metadata[request.tripId];
        if (
          request.expectedMetadataRevision !== m.revision ||
          canonical(m.value) !== canonical(request.before)
        )
          throw Error("REAL_CAS_CONFLICT");
        const revision =
          m.revision + (canonical(request.before) === canonical(request.after) ? 0 : 1);
        if (!flags.wrongMetadata) {
          m.value = request.after;
          m.revision = revision;
        }
        return tripMetadataRevisionedReceiptSchema.parse({
          ...request,
          actorAccountId: a,
          resultMetadataRevision: revision,
        });
      },
      async receipt() {
        throw Error("NOT_USED");
      },
    },
    core: {
      async withLockedCommand(scope, work) {
        calls.push("CORE");
        return work({
          actor: {
            accountId: flags.wrongActor ? randomUUID() : actor,
            tripId: scope.tripId,
            personId: owner,
            personIds: [
              owner,
              ...Object.values(state.people).map((p) => p.person.personId),
            ],
            active: true,
            canManageShared: true,
          },
          readReceipt: async () => state.receipts[scope.operationId] ?? null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => !flags.redacted,
          enabledCommands: async () => [
            "CREATE_ITEM",
            "SET_ITEM_TEXT",
            "SET_ITEM_SCHEDULE",
            "SET_ITEM_PLACE",
            "SET_ITEM_PARTICIPATION",
          ],
          readLockedGraph: async () => state.graph,
          verifyAdmission: async () => {
            if (flags.coreError) throw Error(flags.coreError);
          },
          lifecycleGraphHash: async () => undefined,
          commit: async (mutation, receipt) => {
            if (mutation) state.graph = mutation.graph;
            const domainReceiptId = randomUUID();
            state.receipts[scope.operationId] = {
              domainReceiptId,
              receiptText: canonical(receipt),
            };
            return domainReceiptId;
          },
        });
      },
    },
  };
  async function run(signal?: AbortSignal) {
    // Unit-only outer transaction harness; not a PG/Hosted atomicity claim.
    const before = structuredClone(state);
    try {
      return await executeGuestAdoptionComposite(
        f.user,
        staging,
        checkpoint,
        transaction,
        signal,
      );
    } catch (error) {
      state = before;
      throw error;
    }
  }
  return {
    f,
    checkpoint,
    staging,
    actor,
    owner,
    calls,
    flags,
    transaction,
    run,
    state: () => state,
  };
}
it("executes real Core domain CREATE with explicit Owner map and exact source operation identities", async () => {
  const h = await harness(),
    before = structuredClone(h.checkpoint),
    result = await h.run(),
    out = JSON.parse(result.canonicalText);
  expect(result.authority).toBe("NONE");
  expect(out.binding.actorAccountId).toBe(h.actor);
  expect(out.queueMappings.map((m: { queueId: string }) => m.queueId).sort()).toEqual(
    [...h.f.body.trips[0].queueOperationIds].sort(),
  );
  const core = out.records[0].intents[0];
  expect(core.receipt.outcome).toBe("APPLIED");
  expect(core.receipt.actorAccountId).toBe(h.actor);
  expect(core.receipt.intentSha256).toBe(core.mappedIntentSha256);
  expect(core.sourceIntentSha256).not.toBe(core.mappedIntentSha256);
  expect(h.state().graph.itinerary_events).toHaveLength(1);
  expect(h.state().graph.itinerary_events[0].self_person_id).toBe(h.owner);
  expect(h.checkpoint).toEqual(before);
  expect(h.calls.indexOf("NEW")).toBeLessThan(h.calls.indexOf("TRIP_CREATE"));
  expect(h.calls).not.toContain("COMMIT");
});
it("creates additional people unlinked and preserves their original operation and Person IDs", async () => {
  const h = await harness((f) => {
    const trip = f.body.trips[0],
      person = {
        version: 1,
        operationId: randomUUID(),
        personId: randomUUID(),
        tripId: trip.create.tripId,
        accountId: f.grant.sourceGuestLocalId,
        tripCreateOperationId: trip.create.operationId,
        displayName: trip.creator.displayName,
      };
    (trip.people as unknown[]).push(person);
    trip.queueOperationIds.push(person.operationId);
    f.body.totals.people++;
    f.body.totals.queueOperations++;
    f.grant.resources.people++;
    trip.coreIntents[0].command.payload.acl.people.push(person.personId);
  });
  const out = JSON.parse((await h.run()).canonicalText),
    person = out.records[0].people[0];
  expect(person.person.userId).toBeNull();
  expect(person.request.operationId).toBe(h.f.body.trips[0].queueOperationIds[2]);
  expect(h.calls).toContain("PERSON_READ");
});
function structuredWithDeferred(f: ReturnType<typeof fixture>) {
  const trip = f.body.trips[0];
  Object.assign(trip.create, { formatVersion: 2, destinations: [] });
  const before = {
    name: trip.create.name,
    destination: null,
    startDate: null,
    endDate: null,
    destinations: [],
  };
  const after = { ...before, name: "Guest Edited retained" };
  trip.metadata = after;
  const action = {
    localActionVersion: 1,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId: trip.create.tripId,
    dependencyOperationId: trip.create.operationId,
    before,
    after,
  };
  (trip.deferredMetadata as unknown[]).push(action);
  trip.queueOperationIds.push(action.actionId);
  f.body.totals.queueOperations++;
}
it("uses owning metadata snapshot/CAS and maps deferred queue action ID to its real operation", async () => {
  const h = await harness(structuredWithDeferred),
    out = JSON.parse((await h.run()).canonicalText),
    m = out.records[0].metadata[0];
  expect(m.receipt.formatVersion).toBe(3);
  expect(m.receipt.expectedMetadataRevision).toBe(0);
  expect(m.receipt.resultMetadataRevision).toBe(1);
  expect(m.sourceAction.actionId).not.toBe(m.receipt.operationId);
  expect(out.queueMappings).toContainEqual({
    queueId: m.sourceAction.actionId,
    operationId: m.receipt.operationId,
    kind: "TRIP_METADATA_DEFERRED",
  });
  expect(h.calls.filter((x) => x === "METADATA_READ")).toHaveLength(2);
});
it.each(["REVISION_CONFLICT", "TRIP_NOT_AUTHORIZED"])(
  "throws on actual Core %s receipt and lets owning transaction discard partial mutations",
  async (error) => {
    const h = await harness();
    h.flags.coreError = error;
    await expect(h.run()).rejects.toThrow("CORE_NOT_APPLIED");
    expect(Object.keys(h.state().trips)).toHaveLength(0);
    expect(Object.keys(h.state().receipts)).toHaveLength(0);
  },
);
it("refuses STATUS_ONLY even though Core wrote an internal domain receipt", async () => {
  const h = await harness();
  h.flags.redacted = true;
  await expect(h.run()).rejects.toThrow("CORE_RECEIPT_REQUIRED");
  expect(Object.keys(h.state().trips)).toHaveLength(0);
});
it("does not adopt into an existing Trip even when a matching operation could replay", async () => {
  const h = await harness();
  await h.run();
  const before = structuredClone(h.state());
  await expect(h.run()).rejects.toThrow("TRIP_COLLISION");
  expect(h.state()).toEqual(before);
});
it.each(["ledger", "readback", "metadata"])(
  "rejects incorrect owning %s readback and retains the entire local source",
  async (kind) => {
    const h = await harness(kind === "metadata" ? structuredWithDeferred : undefined),
      source = structuredClone(h.checkpoint);
    if (kind === "ledger") h.flags.wrongLedger = true;
    if (kind === "readback") h.flags.wrongReadback = true;
    if (kind === "metadata") h.flags.wrongMetadata = true;
    await expect(h.run()).rejects.toThrow("READBACK_MISMATCH");
    expect(h.state().graph.itinerary_events).toHaveLength(0);
    expect(Object.keys(h.state().trips)).toHaveLength(0);
    expect(h.checkpoint).toEqual(source);
  },
);
it("does not manufacture restore qualification by preserving Draft bytes", async () => {
  const h = await harness(undefined, true);
  await expect(h.run()).rejects.toThrow("DRAFT_RESTORE_REQUIRED");
  expect(h.calls).toEqual([]);
});
it("fences cancel/expiry after Trip creation, before any further owning operations", async () => {
  const h = await harness(),
    controller = new AbortController();
  h.flags.afterCreate = () => controller.abort();
  await expect(h.run(controller.signal)).rejects.toThrow("EXECUTION_ABORTED");
  expect(h.calls).not.toContain("LEDGER");
  expect(Object.keys(h.state().trips)).toHaveLength(0);
  vi.useFakeTimers();
  const expired = await harness();
  expired.flags.afterCreate = () => vi.setSystemTime(Date.now() + 60001);
  await expect(expired.run()).rejects.toThrow("GRANT_EXPIRED");
  expect(expired.calls).not.toContain("LEDGER");
});
it("pins the normal actor and rejects an independently wrong Core actor", async () => {
  const h = await harness(),
    original = h.actor;
  h.flags.afterCreate = () => {
    h.f.user.id = randomUUID();
  };
  const out = JSON.parse((await h.run()).canonicalText);
  expect(out.binding.actorAccountId).toBe(original);
  const foreign = await harness();
  foreign.flags.wrongActor = true;
  await expect(foreign.run()).rejects.toThrow("NOT_VISIBLE");
  expect(Object.keys(foreign.state().trips)).toHaveLength(0);
});
it("default stays closed and anonymous targets never reach an owning port", async () => {
  const h = await harness();
  await expect(
    executeGuestAdoptionComposite(h.f.user, h.staging, h.checkpoint),
  ).rejects.toThrow("COMPOSITE_CLOSED");
  await expect(
    executeGuestAdoptionComposite(
      { ...h.f.user, accountClass: "ANONYMOUS" },
      h.staging,
      h.checkpoint,
      h.transaction,
    ),
  ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
  expect(h.calls).toEqual([]);
});

it("refuses changed deferred covers before any owning IO instead of marking them complete", async () => {
  const h = await harness((f) => {
    structuredWithDeferred(f);
    Object.assign(f.body.trips[0].deferredMetadata[0], {
      cover: { before: null, after: "city" },
    });
    Object.assign(f.body.trips[0], { selectedCoverAssetId: "city" });
  });
  await expect(h.run()).rejects.toThrow("COVER_RESTORE_REQUIRED");
  expect(h.calls).toEqual([]);
});
it("explicitly retains local names/timestamps/static covers without claiming their restore", async () => {
  const h = await harness((f) =>
    Object.assign(f.body.trips[0], {
      selectedCoverAssetId: "city",
      personalCover: { selectedCoverAssetId: "city" },
    }),
  );
  const out = JSON.parse((await h.run()).canonicalText);
  expect(out.localRestoreStatus).toBe("REQUIRED_NOT_EXECUTED");
  expect(out.retainedLocalState[0]).toMatchObject({
    creator: h.f.body.trips[0].creator,
    sourceTimeline: h.f.body.trips[0].sourceTimeline,
    selectedCoverAssetId: "city",
    personalCover: { selectedCoverAssetId: "city" },
  });
});
