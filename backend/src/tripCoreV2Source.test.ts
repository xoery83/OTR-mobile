import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { coreHashValue as importDigest } from "@/domain/trip/tripCoreV2Read";
import type { FlightOutputClaimV2 } from "@/domain/trip/flightOutputPurposeV2";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreGraph,
} from "@/domain/trip/tripCoreV2Mutation";
import type { CoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  prepareCoreSourcePlanV2,
  finalizeCoreSourceSlotV2,
  readCoreSourcePlanV2,
  type CoreSourcePlanStorageV2,
  type CoreSourcePlanTransactionV2,
  type CoreSourceCatalogV2,
  type CoreSourceStoredPlanV2,
  type CoreSourcePrepareV2,
} from "./tripCoreV2Source";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import intents from "@/data/repositories/__fixtures__/tripImportIntents.json";
import { flightCommandLeaves, type FlightValues } from "@/domain/trip/flightAdmission";
const id = (n: number) => `fb000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = {
  accountId: id(1),
  tripId: id(2),
  active: true,
  canManageShared: false,
  personId: null,
  personIds: [],
};
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => canonicalCoreJson(value as Json);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

// Disposable durable test adapter only; production Source transactions remain Core-owned.
class Store implements CoreSourcePlanStorageV2 {
  db: DatabaseSync;
  finalizeUnavailable = false;
  admissionDenials = new Map<string, string>();
  constructor(readonly file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS facts(key TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,slot TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(op TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,body TEXT NOT NULL)",
    );
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO facts VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
      )
      .run(key, json(value));
  }
  get<T>(key: string): T {
    const row = this.db.prepare("SELECT body FROM facts WHERE key=?").get(key) as {
      body: string;
    };
    return JSON.parse(row.body) as T;
  }
  plans() {
    return this.db
      .prepare("SELECT body FROM plans")
      .all()
      .map((row) => JSON.parse(row.body as string) as CoreSourceStoredPlanV2);
  }
  async withLockedSourcePlan<T>(
    scope: Parameters<CoreSourcePlanStorageV2["withLockedSourcePlan"]>[0],
    task: (tx: CoreSourcePlanTransactionV2) => Promise<T>,
  ): Promise<T> {
    if (scope.actorAccountId !== actor.accountId || scope.tripId !== actor.tripId)
      throw new Error("NOT_VISIBLE");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await task({
        readPlan: async () =>
          this.plans().find((p) => p.scope.planId === scope.planId) ?? null,
        readSealedCatalog: async () => this.get<CoreSourceCatalogV2>("catalog"),
        readClaims: async () => [
          ...this.get<FlightOutputClaimV2[]>("legacy"),
          ...this.plans().flatMap((p) =>
            p.slots.flatMap((s) =>
              s.binding && s.certified && s.proposed.command === "CREATE_SPARSE_FLIGHT"
                ? [
                    {
                      kind: "CERTIFIED" as const,
                      binding: s.binding,
                      certified: s.certified,
                      outcome:
                        s.receipt?.outcome === "APPLIED"
                          ? ("SUCCEEDED" as const)
                          : ("UNKNOWN" as const),
                    },
                  ]
                : [],
            ),
          ),
        ],
        verifyFlightEvidence: async ({ catalog, candidate, slot, command, binding }) => {
          const sealed = this.get<CoreSourceCatalogV2>("catalog"),
            known = sealed.candidates.find(
              (c) => c.candidateId === candidate.candidateId,
            );
          if (
            json(catalog) !== json(sealed) ||
            !known ||
            json(candidate) !== json(known) ||
            binding.candidateSha256 !==
              (await importDigest("test-sealed-candidate", known.snapshot, hash))
          )
            throw new Error("INVALID_PROVENANCE");
          for (const input of sealed.inputs) {
            const relation = (
              input as {
                relationship?: {
                  kind: string;
                  candidateId: string;
                  previousCandidateId: string;
                };
              }
            ).relationship;
            if (
              command.command === "CREATE_SPARSE_FLIGHT" &&
              relation?.kind === "FLIGHT_RETIMING" &&
              relation.candidateId === candidate.candidateId &&
              sealed.candidates.some(
                (c) => c.candidateId === relation.previousCandidateId,
              )
            )
              throw new Error("PREDECESSOR_OUTCOME_UNKNOWN");
          }
          const snapshot = known.snapshot as {
            flightNumberLiteral: string;
            departureDate: string;
          };
          if (
            command.command === "CREATE_SPARSE_FLIGHT" &&
            ((command.payload as typeof snapshot).flightNumberLiteral !==
              snapshot.flightNumberLiteral ||
              (command.payload as typeof snapshot).departureDate !==
                snapshot.departureDate)
          )
            throw new Error("INVALID_PROVENANCE");
          if (command.command === "QUALIFY_FLIGHT") {
            const expectedPayload = (known.snapshot as Record<string, Json>).qualified;
            if (!expectedPayload || json(command.payload) !== json(expectedPayload))
              throw new Error("INVALID_PROVENANCE");
            const values = command.payload as unknown as FlightValues;
            if (
              json(slot.selectedFields) !== json(Object.keys(flightCommandLeaves(values)))
            )
              throw new Error("INVALID_PROVENANCE");
            const refs = Object.values(
              (command.payload as { proofs: Record<string, { ref: string }> }).proofs,
            ).map((p) => p.ref);
            if (
              json(Object.values(slot.evidenceRefs).flat().sort()) !==
              json([...Object.values(known.identityEvidenceRefs!).flat(), ...refs].sort())
            )
              throw new Error("INVALID_PROVENANCE");
            return;
          }
          const expected = Object.values(known.identityEvidenceRefs!).flat();
          if (
            json(slot.selectedFields) !==
              json(["flightNumberLiteral", "departureDate"]) ||
            json(Object.values(slot.evidenceRefs).flat().sort()) !== json(expected.sort())
          )
            throw new Error("INVALID_PROVENANCE");
        },
        assertCommandAdmission: async (command) => {
          const denied = this.admissionDenials.get(command.target.id);
          if (denied) throw new Error(denied);
          applyCoreCommand(
            this.get<CoreGraph>("graph"),
            command,
            actor,
            "2026-10-12T00:00:00Z",
            true,
          );
        },
        readCoreReceipt: async (op) => {
          const r = this.db.prepare("SELECT id,body FROM receipts WHERE op=?").get(op);
          return r
            ? { domainReceiptId: r.id as string, receiptText: r.body as string }
            : null;
        },
        putPlan: async (plan) => {
          for (const s of plan.slots)
            if (s.command) {
              const old = this.db
                .prepare("SELECT slot FROM operations WHERE id=?")
                .get(s.command.operationId);
              if (old && old.slot !== s.proposed.slotId)
                throw new Error("OPERATION_REUSE_MISMATCH");
              this.db
                .prepare("INSERT OR IGNORE INTO operations VALUES(?,?)")
                .run(s.command.operationId, s.proposed.slotId);
            }
          this.db
            .prepare(
              "INSERT INTO plans VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
            )
            .run(plan.scope.planId, json(plan));
        },
        finalizeEvidence: async () =>
          this.finalizeUnavailable
            ? { state: "EVIDENCE_PENDING", errorCode: "EVIDENCE_UNAVAILABLE" }
            : { state: "COMPLETE", errorCode: null },
      });
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async execute(command: CoreCommand) {
    const record = await executeCoreCommandV2(
      {
        withLockedCommand: async (scope, work) => {
          if (scope.actorAccountId !== actor.accountId || scope.tripId !== actor.tripId)
            throw new Error("NOT_VISIBLE");
          this.db.exec("BEGIN IMMEDIATE");
          try {
            const result = await work({
              actor,
              readReceipt: async () => {
                const row = this.db
                  .prepare("SELECT id,body FROM receipts WHERE op=?")
                  .get(scope.operationId);
                return row
                  ? { domainReceiptId: row.id as string, receiptText: row.body as string }
                  : null;
              },
              hasLegacyOperation: async () => false,
              canReadReceipt: async () => true,
              enabledCommands: async () => [
                "CREATE_SPARSE_FLIGHT",
                "QUALIFY_FLIGHT",
                "UPDATE_FLIGHT_FACTS",
                "REPLACE_FLIGHT_SERVICE",
              ],
              readLockedGraph: async () => this.get<CoreGraph>("graph"),
              verifyAdmission: async (q, sha) => {
                if (q.admission.mode === "MANUAL") return;
                const plan = this.plans().find((p) =>
                  p.slots.some((s) => s.proposed.slotId === q.admission.sourceIntentId),
                );
                const slot = plan?.slots.find(
                  (s) => s.proposed.slotId === q.admission.sourceIntentId,
                );
                if (
                  !plan ||
                  plan.scope.actorAccountId !== actor.accountId ||
                  plan.scope.tripId !== actor.tripId ||
                  !slot?.certified ||
                  slot.state !== "READY" ||
                  slot.intentSha256 !== sha ||
                  json(slot.command) !== json(q)
                )
                  throw new Error("INVALID_PROVENANCE");
              },
              lifecycleGraphHash: async () => undefined,
              commit: async (mutation, receipt) => {
                if (mutation) this.set("graph", mutation.graph);
                const receiptId = id(
                  900 + this.db.prepare("SELECT * FROM receipts").all().length,
                );
                this.db
                  .prepare("INSERT INTO receipts VALUES(?,?,?)")
                  .run(scope.operationId, receiptId, json(receipt));
                return receiptId;
              },
            });
            this.db.exec("COMMIT");
            return result;
          } catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
          }
        },
      },
      actor.accountId,
      actor.tripId,
      command,
      hash,
      () => "2026-10-12T00:00:00Z",
    );
    if (record.projection !== "FULL") throw new Error("NOT_VISIBLE");
    return record;
  }
  close() {
    this.db.close();
  }
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-source-plan-"));
  directories.push(directory);
  const store = new Store(join(directory, "test.sqlite"));
  store.set("graph", emptyCoreGraph());
  store.set("legacy", []);
  const candidates = await Promise.all(
    [1, 2].map(async (n) => {
      const snapshot = {
        flightNumberLiteral: `NZ${n}`,
        departureDate: n === 1 ? "2026-12-17" : "2026-12-20",
      };
      const ref = (field: string) => `track-c/field-evidence/${id(20 + n)}/${field}`;
      return {
        candidateId: id(20 + n),
        runId: id(10),
        kind: "P2",
        snapshot,
        candidateSha256: await importDigest("test-sealed-candidate", snapshot, hash),
        identityFacts: {
          namespace: "IATA_AIRLINE" as const,
          issuer: "IATA" as const,
          operator: "NZ",
          serviceNumber: String(n),
          originDate: snapshot.departureDate,
          originAirportId: n === 1 ? "airport:AKL" : "airport:CHC",
          destinationAirportId: n === 1 ? "airport:CHC" : "airport:AKL",
        },
        identityEvidenceRefs: {
          service: [ref("service")],
          originDate: [ref("date")],
          originAirportId: [ref("origin")],
          destinationAirportId: [ref("destination")],
        },
      };
    }),
  );
  const catalog: CoreSourceCatalogV2 = {
    actorAccountId: actor.accountId,
    tripId: actor.tripId,
    sourceId: id(3),
    sourceRevision: 1,
    inputCatalogSha256: "a".repeat(64),
    source: { id: id(3) },
    inputs: [{ id: id(4), revision: 1 }],
    candidates,
  };
  catalog.inputCatalogSha256 = await importDigest(
    "test-input-catalog",
    catalog.inputs,
    hash,
  );
  store.set("catalog", catalog);
  const request: CoreSourcePrepareV2 = {
    captureVersion: 2,
    planId: id(5),
    sourceId: id(3),
    sourceRevision: 1,
    mode: "REVIEWED_SOURCE",
    policyVersion: null,
    candidateIds: candidates.map((c) => c.candidateId),
    slots: candidates.map((c, i) => ({
      slotId: id(30 + i),
      slotKey: "flight",
      candidateId: c.candidateId,
      targetKind: "ITEM",
      target: { kind: "ITEM", id: id(40 + i) },
      command: "CREATE_SPARSE_FLIGHT",
      operationId: id(50 + i),
      dependsOn: [],
      selectedFields: ["flightNumberLiteral", "departureDate"],
      evidenceRefs: c.identityEvidenceRefs,
      baseVector: [{ kind: "ITEM", id: id(40 + i), revision: null }],
      payload: JSON.parse(
        json({ ...(c.snapshot as object), ...coreDefaults("member") }),
      ) as Json,
    })),
  };
  return { store, request, catalog };
}
const prepare = (store: Store, request: CoreSourcePrepareV2) =>
  prepareCoreSourcePlanV2(store, actor.accountId, actor.tripId, request, hash);
function finalInput(slotId: string, record: Awaited<ReturnType<Store["execute"]>>) {
  return {
    captureVersion: 2,
    slotId,
    operationId: record.receipt.operationId,
    intentSha256: record.receipt.intentSha256,
    domainReceiptId: record.domainReceiptId,
    receiptSha256: record.receipt.receiptSha256,
  };
}
const finalize = (store: Store, plan: string, input: unknown) =>
  finalizeCoreSourceSlotV2(store, actor.accountId, actor.tripId, plan, input, hash);

describe("Core owning Flight Source plan transaction v2", () => {
  it("durably prepares two distinct outputs, replays after reopen, and never writes canonical items during preparation", async () => {
    const f = await fixture();
    const a = await prepare(f.store, f.request);
    expect(a.readyCommands).toHaveLength(2);
    expect(f.store.get<CoreGraph>("graph").itinerary_events).toHaveLength(0);
    f.store.close();
    const reopened = new Store(f.store.file);
    expect(await prepare(reopened, f.request)).toEqual(a);
    for (const command of a.readyCommands) await reopened.execute(command);
    for (const command of a.readyCommands) await reopened.execute(command);
    expect(reopened.get<CoreGraph>("graph").itinerary_events).toHaveLength(2);
    expect(reopened.db.prepare("SELECT * FROM receipts").all()).toHaveLength(2);
    reopened.close();
  });
  it("keeps successful output while unresolved sibling is reviewed and survives evidence-finalization retry", async () => {
    const f = await fixture();
    f.catalog.candidates[1].identityFacts = null;
    f.store.set("catalog", f.catalog);
    const p = await prepare(f.store, f.request);
    expect(p.readyCommands).toHaveLength(1);
    expect(p.plan.slots).toHaveLength(1);
    expect(p.plan.slots[0].outputPurpose).not.toBeNull();
    expect(p.reviewSlots[0].errorCode).toBe("UNRESOLVED_IDENTITY");
    const r = await f.store.execute(p.readyCommands[0]);
    f.store.finalizeUnavailable = true;
    expect(
      (
        await finalize(
          f.store,
          f.request.planId,
          finalInput(f.request.slots[0].slotId, r),
        )
      ).state,
    ).toBe("EVIDENCE_PENDING");
    expect((await prepare(f.store, f.request)).readyCommands).toHaveLength(0);
    f.store.finalizeUnavailable = false;
    expect(
      (
        await finalize(
          f.store,
          f.request.planId,
          finalInput(f.request.slots[0].slotId, r),
        )
      ).state,
    ).toBe("COMPLETE");
    expect(f.store.get<CoreGraph>("graph").itinerary_events).toHaveLength(1);
    f.store.close();
  });
  it("rejects same-output allocation and overlapping siblings without defeating UNKNOWN", async () => {
    for (const same of [true, false]) {
      const f = await fixture();
      f.catalog.candidates[1].identityFacts = {
        ...f.catalog.candidates[0].identityFacts!,
        ...(same ? {} : { serviceNumber: "999" }),
      };
      f.store.set("catalog", f.catalog);
      const p = await prepare(f.store, f.request);
      expect(p.readyCommands).toHaveLength(1);
      expect(p.reviewSlots[0].errorCode).toBe(
        same ? "OUTPUT_PURPOSE_COLLISION" : "PREDECESSOR_OUTCOME_UNKNOWN",
      );
      f.store.close();
    }
  });
  it("fences legacy UNKNOWN, permits a new plan after trusted NO_COMMIT, and preserves exact replay despite later UNKNOWN", async () => {
    const f = await fixture();
    const claim = {
      kind: "LEGACY" as const,
      accountId: actor.accountId,
      tripId: actor.tripId,
      slotId: id(99),
      outcome: "UNKNOWN" as const,
    };
    f.store.set("legacy", [claim]);
    expect((await prepare(f.store, f.request)).readyCommands).toHaveLength(0);
    f.store.set("legacy", [{ ...claim, outcome: "NO_COMMIT" }]);
    f.request.planId = id(6);
    f.request.slots.forEach((s, i) => {
      s.slotId = id(60 + i);
      s.operationId = id(70 + i);
    });
    const ready = await prepare(f.store, f.request);
    expect(ready.readyCommands).toHaveLength(2);
    f.store.set("legacy", [claim]);
    expect(await prepare(f.store, f.request)).toEqual(ready);
    f.store.close();
  });
  it("fences actor, trip, stale Source, wrong target and altered operation replay", async () => {
    const f = await fixture();
    await expect(
      prepareCoreSourcePlanV2(f.store, id(88), actor.tripId, f.request, hash),
    ).rejects.toThrow("NOT_VISIBLE");
    await expect(
      prepareCoreSourcePlanV2(f.store, actor.accountId, id(88), f.request, hash),
    ).rejects.toThrow("NOT_VISIBLE");
    const stale = structuredClone(f.request);
    stale.sourceRevision = 2;
    await expect(prepare(f.store, stale)).rejects.toThrow("INPUT_STALE");
    const wrong = structuredClone(f.request);
    wrong.slots[0].baseVector![0].id = id(89);
    expect((await prepare(f.store, wrong)).reviewSlots[0].errorCode).toBe(
      "INVALID_BASE_VECTOR",
    );
    await expect(prepare(f.store, f.request)).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    f.store.close();
  });
  it("rejects same-target claims and bad evidence pins", async () => {
    const f = await fixture();
    f.request.slots[1].target.id = f.request.slots[0].target.id;
    f.request.slots[1].baseVector![0].id = f.request.slots[0].target.id;
    expect((await prepare(f.store, f.request)).reviewSlots[0].errorCode).toBe(
      "OUTPUT_TARGET_COLLISION",
    );
    f.store.close();
    const g = await fixture();
    g.request.slots[0].evidenceRefs.service = [
      `track-c/field-evidence/${id(999)}/service`,
    ];
    expect((await prepare(g.store, g.request)).reviewSlots[0].errorCode).toBe(
      "INVALID_PROVENANCE",
    );
    g.store.close();
  });
  it("requires exact receipt ID/hash and never treats absence as a fresh operation", async () => {
    const f = await fixture(),
      p = await prepare(f.store, f.request);
    const r = await f.store.execute(p.readyCommands[0]);
    const input = finalInput(f.request.slots[0].slotId, r);
    await expect(
      finalize(f.store, f.request.planId, { ...input, domainReceiptId: id(999) }),
    ).rejects.toThrow("INVALID_DOMAIN_RECEIPT");
    await expect(
      finalize(f.store, f.request.planId, { ...input, receiptSha256: "0".repeat(64) }),
    ).rejects.toThrow("INVALID_DOMAIN_RECEIPT");
    expect((await finalize(f.store, f.request.planId, input)).state).toBe("COMPLETE");
    expect((await finalize(f.store, f.request.planId, input)).state).toBe("COMPLETE");
    const status = await readCoreSourcePlanV2(
      f.store,
      actor.accountId,
      actor.tripId,
      f.request.planId,
      hash,
    );
    expect(status.status.slots[0].domainReceiptId).toBe(r.domainReceiptId);
    expect(f.store.get<CoreGraph>("graph").itinerary_events).toHaveLength(1);
    f.store.close();
  });
  it("retains rejected receipt and its output claim, without a replacement command", async () => {
    const f = await fixture(),
      p = await prepare(f.store, f.request);
    await f.store.execute({
      ...p.readyCommands[0],
      operationId: id(777),
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    });
    const r = await f.store.execute(p.readyCommands[0]);
    expect(r.receipt.outcome).toBe("CONFLICT");
    await finalize(f.store, f.request.planId, finalInput(f.request.slots[0].slotId, r));
    const replay = await prepare(f.store, f.request);
    expect(replay.readyCommands).toHaveLength(1);
    expect(replay.reviewSlots[0].errorCode).toBe("REVISION_CONFLICT");
    expect(f.store.get<CoreGraph>("graph").itinerary_events).toHaveLength(1);
    f.store.close();
  });
});

async function dependencyFixture() {
  const f = await fixture();
  const values = structuredClone(
    intents.confirmation.slots[0].reviewed_payload.edits,
  ) as unknown as Required<FlightValues>;
  // The synthetic Source uses AKL/CHC; borrow only the legacy fixture's time/service shape.
  values.destination.location.authored_label = "Christchurch";
  const flightNumberLiteral = values.title;
  f.catalog.candidates[0].identityFacts!.serviceNumber =
    values.services[0].service_number;
  f.catalog.candidates[0].snapshot = {
    ...(f.catalog.candidates[0].snapshot as object),
    flightNumberLiteral,
  };
  delete (values as FlightValues).title;
  const proofs = Object.fromEntries(
    Object.keys(flightCommandLeaves(values)).map((field) => [
      field,
      {
        kind: "TRACK_C",
        ref: `track-c/field-evidence/${f.catalog.candidates[0].candidateId}/${field}`,
      },
    ]),
  );

  const qualified = {
    origin: values.origin,
    destination: values.destination,
    services: values.services,
    proofs,
  };
  f.catalog.candidates[0].snapshot = {
    ...(f.catalog.candidates[0].snapshot as object),
    qualified: qualified as unknown as Json,
  };
  f.catalog.candidates[0].candidateSha256 = await importDigest(
    "test-sealed-candidate",
    f.catalog.candidates[0].snapshot,
    hash,
  );
  f.store.set("catalog", f.catalog);
  f.request.candidateIds = [f.request.candidateIds[0]];
  f.request.slots = [f.request.slots[0]];
  f.request.slots[0].payload = {
    flightNumberLiteral,
    departureDate: "2026-12-17",
    ...JSON.parse(json(coreDefaults("member"))),
  };
  const create = f.request.slots[0];
  f.request.slots.push({
    ...structuredClone(create),
    slotId: id(300),
    slotKey: "qualify",
    operationId: id(301),
    command: "QUALIFY_FLIGHT",
    dependsOn: [create.slotId],
    baseVector: null,
    payload: qualified as unknown as Json,
    selectedFields: Object.keys(flightCommandLeaves(values)),
    evidenceRefs: {
      ...f.catalog.candidates[0].identityEvidenceRefs!,
      ...Object.fromEntries(Object.entries(proofs).map(([field, p]) => [field, [p.ref]])),
    },
  });
  return f;
}
describe("Source receipt and immutable plan trust boundary", () => {
  it("rejects a tampered frozen command on replay before returning it", async () => {
    const f = await fixture();
    await prepare(f.store, f.request);
    const p = f.store.plans()[0];
    p.slots[0].command!.target.id = id(888);
    f.store.db
      .prepare("UPDATE plans SET body=? WHERE id=?")
      .run(json(p), f.request.planId);
    await expect(prepare(f.store, f.request)).rejects.toThrow("INVALID_BASE_VECTOR");
    f.store.close();
  });
  it("rejects a full receipt whose exact vector or unrelated result disagrees with the frozen Flight", async () => {
    for (const unrelated of [false, true]) {
      const f = await fixture(),
        p = await prepare(f.store, f.request),
        r = await f.store.execute(p.readyCommands[0]);
      const body = structuredClone(r.receipt) as Omit<
        typeof r.receipt,
        "receiptSha256"
      > & { receiptSha256?: string };
      delete body.receiptSha256;
      if (unrelated) body.result.created = [{ kind: "BOOKING", id: id(888) }];
      else body.targetVector[0].id = id(888);
      const receipt = {
        ...body,
        receiptSha256: await importDigest("otr-trip-core-receipt-v2", body as Json, hash),
      };
      f.store.db
        .prepare("UPDATE receipts SET body=? WHERE op=?")
        .run(json(receipt), p.readyCommands[0].operationId);
      await expect(prepare(f.store, f.request)).rejects.toThrow("INVALID_DOMAIN_RECEIPT");
      f.store.close();
    }
  });
  it("retains pending operation and claim when the canonical receipt is unavailable", async () => {
    const f = await fixture(),
      p = await prepare(f.store, f.request);
    const unavailable = {
      captureVersion: 2,
      slotId: f.request.slots[0].slotId,
      operationId: p.readyCommands[0].operationId,
      intentSha256: await importDigest(
        "otr-trip-core-intent-v2",
        p.readyCommands[0] as Json,
        hash,
      ),
      domainReceiptId: id(999),
      receiptSha256: "0".repeat(64),
    };
    expect((await finalize(f.store, f.request.planId, unavailable)).errorCode).toBe(
      "RECEIPT_UNAVAILABLE",
    );
    expect((await prepare(f.store, f.request)).readyCommands).toEqual(p.readyCommands);
    expect(f.store.plans()[0].slots[0].certified).not.toBeNull();
    f.store.close();
  });
  it("rejects global operation reuse and rolls back the second plan's preparations", async () => {
    const f = await fixture();
    const first = await prepare(f.store, f.request);
    f.request.planId = id(888);
    f.request.slots.forEach((s, i) => {
      s.slotId = id(880 + i);
      s.target.id = id(890 + i);
      s.baseVector![0].id = s.target.id;
    });
    f.catalog.candidates.forEach((c) => {
      c.identityFacts!.originDate = "2026-12-30";
    });
    f.store.set("catalog", f.catalog);
    await expect(prepare(f.store, f.request)).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    expect(f.store.plans()).toHaveLength(1);
    expect(f.store.plans()[0].slots[0].command).toEqual(first.readyCommands[0]);
    f.store.close();
  });
  it("prepares the independent Flight while a fractional unsupported sibling remains Review", async () => {
    const f = await fixture();
    f.request.slots[1].command = "CREATE_ITEM";
    f.request.slots[1].payload = {
      family: "P1",
      place: { latitude: -36.8485, longitude: 174.7633 },
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    const prepared = await prepare(f.store, f.request);
    expect(prepared.readyCommands).toHaveLength(1);
    expect(prepared.reviewSlots).toEqual([
      { slotId: f.request.slots[1].slotId, errorCode: "CONTRACT_UNSUPPORTED" },
    ]);
    expect(prepared.plan.slots).toHaveLength(1);
    f.store.close();
    const reopened = new Store(f.store.file);
    expect(await prepare(reopened, f.request)).toEqual(prepared);
    reopened.close();
  });
  it("rejects a second CREATE for a retimed flight despite complete exact leaves and different dates", async () => {
    const f = await fixture();
    const previous = f.catalog.candidates[0],
      retimed = f.catalog.candidates[1];
    retimed.snapshot = { flightNumberLiteral: "NZ1", departureDate: "2026-12-20" };
    retimed.identityFacts = { ...previous.identityFacts!, originDate: "2026-12-20" };
    retimed.candidateSha256 = await importDigest(
      "test-sealed-candidate",
      retimed.snapshot,
      hash,
    );
    f.request.slots[1].payload = {
      ...(retimed.snapshot as object),
      ...JSON.parse(json(coreDefaults("member"))),
    };
    f.catalog.inputs.push({
      id: id(800),
      sourceId: f.catalog.sourceId,
      sourceRevision: 1,
      relationship: {
        kind: "FLIGHT_RETIMING",
        candidateId: retimed.candidateId,
        previousCandidateId: previous.candidateId,
      },
      sourceText: "Departure moved from 17 December to 20 December",
    });
    f.catalog.inputCatalogSha256 = await importDigest(
      "test-input-catalog",
      f.catalog.inputs,
      hash,
    );
    f.store.set("catalog", f.catalog);
    const prepared = await prepare(f.store, f.request);
    expect(prepared.readyCommands).toHaveLength(1);
    expect(prepared.reviewSlots[0].errorCode).toBe("PREDECESSOR_OUTCOME_UNKNOWN");
    expect(prepared.plan.slots).toHaveLength(1);
    expect(f.store.plans()[0].slots[1].certified).toBeNull();
    f.store.close();
  });
  it.each([
    "SCOPE_NOT_AUTHORIZED",
    "INVALID_SELF_PERSON",
    "CROSS_TRIP_PERSON",
    "CROSS_TRIP_REFERENCE",
    "CORE_CAPABILITY_CLOSED",
  ])(
    "retains independent preparation when owning admission denies a sibling with %s",
    async (error) => {
      const f = await fixture();
      f.store.admissionDenials.set(f.request.slots[1].target.id, error);
      const p = await prepare(f.store, f.request);
      expect(p.readyCommands).toHaveLength(1);
      expect(p.reviewSlots).toEqual([
        { slotId: f.request.slots[1].slotId, errorCode: error },
      ]);
      expect(p.plan.slots).toHaveLength(1);
      expect(f.store.plans()[0].slots[1].command).toBeNull();
      expect(f.store.plans()[0].slots[1].certified).toBeNull();
      f.store.close();
    },
  );
  it.each(["SELF", "SELECTED_MEMBERS"] as const)(
    "checks actual Core Person participation instead of accepting proposed %s bindings",
    async (mode) => {
      const f = await fixture();
      const payload = f.request.slots[1].payload as Record<string, Json>;
      payload.participation = {
        mode,
        people: mode === "SELF" ? [] : [id(990)],
        selfPersonId: mode === "SELF" ? id(990) : null,
      };
      const p = await prepare(f.store, f.request);
      expect(p.readyCommands).toHaveLength(1);
      expect(p.reviewSlots[0].errorCode).toBe(
        mode === "SELF" ? "INVALID_SELF_PERSON" : "CROSS_TRIP_PERSON",
      );
      f.store.close();
    },
  );
  it("rolls back all preparation metadata for an unexpected storage fault", async () => {
    const f = await fixture();
    f.store.admissionDenials.set(
      f.request.slots[1].target.id,
      "UNEXPECTED_STORAGE_FAULT",
    );
    await expect(prepare(f.store, f.request)).rejects.toThrow("UNEXPECTED_STORAGE_FAULT");
    expect(f.store.plans()).toEqual([]);
    expect(f.store.db.prepare("SELECT * FROM operations").all()).toEqual([]);
    expect(f.store.get<CoreGraph>("graph").itinerary_events).toHaveLength(0);
    f.store.close();
  });
  it("reviews unsupported modes without opening mutation capabilities", async () => {
    const f = await fixture();
    f.request.mode = "AUTO_SOURCE";
    f.request.policyVersion = "otr.trip.auto-admit/1";
    const p = await prepare(f.store, f.request);
    expect(p.readyCommands).toHaveLength(0);
    expect(p.reviewSlots.map((s) => s.errorCode)).toEqual([
      "CONTRACT_UNSUPPORTED",
      "CONTRACT_UNSUPPORTED",
    ]);
    f.store.close();
  });
});
describe("exact receipt-dependent Flight update", () => {
  it("binds qualification to the sparse-create receipt revision and retains the same canonical UUID", async () => {
    const f = await dependencyFixture();
    const first = await prepare(f.store, f.request);
    expect(first.readyCommands).toHaveLength(1);
    expect(first.reviewSlots[0].errorCode).toBe("DEPENDENCY_PENDING");
    await f.store.execute(first.readyCommands[0]);
    const second = await prepare(f.store, f.request);
    expect(second.readyCommands).toHaveLength(1);
    expect(second.readyCommands[0].command).toBe("QUALIFY_FLIGHT");
    expect(second.readyCommands[0].baseVector).toEqual([
      { kind: "ITEM", id: f.request.slots[0].target.id, revision: 1 },
    ]);
    await f.store.execute(second.readyCommands[0]);
    const graph = f.store.get<CoreGraph>("graph");
    expect(graph.itinerary_events).toHaveLength(1);
    expect(graph.itinerary_events[0].semantic_revision).toBe(2);
    expect(graph.trip_flight_intents[0].qualification).toBe("QUALIFIED");
    for (const [key, rows] of Object.entries(graph))
      if (
        ![
          "itinerary_events",
          "trip_flight_intents",
          "itinerary_transport_endpoints",
          "itinerary_transport_services",
        ].includes(key)
      )
        expect(rows).toEqual([]);
    f.store.close();
  });
  it("reconciles a rejected frozen UPDATE with its attempted CAS vector retained", async () => {
    const f = await dependencyFixture();
    const first = await prepare(f.store, f.request);
    await f.store.execute(first.readyCommands[0]);
    const second = await prepare(f.store, f.request);
    const g = f.store.get<CoreGraph>("graph");
    g.itinerary_events[0].semantic_revision = 2;
    f.store.set("graph", g);
    const rejected = await f.store.execute(second.readyCommands[0]);
    expect(rejected.receipt.outcome).toBe("CONFLICT");
    expect(rejected.receipt.targetVector[0]).toEqual({
      kind: "ITEM",
      id: f.request.slots[0].target.id,
      baseRevision: 1,
      committedRevision: null,
    });
    await finalize(
      f.store,
      f.request.planId,
      finalInput(f.request.slots[1].slotId, rejected),
    );
    const replay = await prepare(f.store, f.request);
    expect(replay.readyCommands).toHaveLength(0);
    expect(replay.reviewSlots[0].errorCode).toBe("REVISION_CONFLICT");
    expect(f.store.get<CoreGraph>("graph").trip_flight_intents[0].qualification).toBe(
      "SPARSE",
    );
    f.store.close();
  });
  it("preserves an existing independent Booking through Flight preparation and qualification", async () => {
    const f = await dependencyFixture();
    const before = applyCoreCommand(
      emptyCoreGraph(),
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: id(701),
        tripId: actor.tripId,
        command: "CREATE_BOOKING",
        target: { kind: "BOOKING", id: id(702) },
        baseVector: [{ kind: "BOOKING", id: id(702), revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          fields: { title: "Independent booking" },
          observations: [],
          itemIds: [],
          entitlementIds: [],
          documentIds: [],
          acl: { visibility: "PRIVATE", people: [] },
        },
      },
      actor,
      "2026-10-12T00:00:00Z",
    ).graph;
    f.store.set("graph", before);
    const first = await prepare(f.store, f.request);
    await f.store.execute(first.readyCommands[0]);
    const second = await prepare(f.store, f.request);
    await f.store.execute(second.readyCommands[0]);
    const after = f.store.get<CoreGraph>("graph");
    for (const [key, rows] of Object.entries(before))
      if (
        ![
          "itinerary_events",
          "trip_flight_intents",
          "itinerary_transport_endpoints",
          "itinerary_transport_services",
        ].includes(key)
      )
        expect(after[key as keyof CoreGraph]).toEqual(rows);
    expect(after.itinerary_reservations).toHaveLength(1);
    f.store.close();
  });
  it("qualifies both distinct Source outputs through their own exact CREATE receipts", async () => {
    const f = await dependencyFixture();
    const c = f.catalog.candidates[1],
      first = f.request.slots[0];
    const qualified = structuredClone(
      (f.catalog.candidates[0].snapshot as Record<string, Json>).qualified,
    ) as unknown as {
      origin: Required<FlightValues>["origin"];
      destination: Required<FlightValues>["destination"];
      services: Required<FlightValues>["services"];
      proofs: Record<string, { kind: "TRACK_C"; ref: string }>;
    };
    qualified.origin.location.authored_label = "Christchurch";
    qualified.destination.location.authored_label = "Auckland";
    qualified.origin.time.local_date = "2026-12-20";
    qualified.origin.time.source_instant = "2026-12-19T20:00:00.123456Z";
    qualified.services[0].service_number = "2";
    qualified.services[0].service_literal = "NZ2";
    qualified.proofs = Object.fromEntries(
      Object.keys(flightCommandLeaves(qualified)).map((field) => [
        field,
        {
          kind: "TRACK_C" as const,
          ref: `track-c/field-evidence/${c.candidateId}/${field}`,
        },
      ]),
    );
    c.snapshot = { ...(c.snapshot as object), qualified: qualified as unknown as Json };
    c.candidateSha256 = await importDigest("test-sealed-candidate", c.snapshot, hash);
    f.store.set("catalog", f.catalog);
    const create = {
      ...structuredClone(first),
      slotId: id(400),
      candidateId: c.candidateId,
      operationId: id(401),
      target: { kind: "ITEM" as const, id: id(402) },
      baseVector: [{ kind: "ITEM" as const, id: id(402), revision: null }],
      evidenceRefs: c.identityEvidenceRefs!,
      payload: {
        flightNumberLiteral: "NZ2",
        departureDate: "2026-12-20",
        ...JSON.parse(json(coreDefaults("member"))),
      },
    };
    f.request.candidateIds.push(c.candidateId);
    f.request.slots.push(create, {
      ...structuredClone(create),
      slotId: id(403),
      slotKey: "qualify",
      operationId: id(404),
      command: "QUALIFY_FLIGHT",
      dependsOn: [create.slotId],
      baseVector: null,
      payload: qualified as unknown as Json,
      selectedFields: Object.keys(flightCommandLeaves(qualified)),
      evidenceRefs: {
        ...c.identityEvidenceRefs!,
        ...Object.fromEntries(
          Object.entries(qualified.proofs).map(([field, proof]) => [field, [proof.ref]]),
        ),
      },
    });
    const sparse = await prepare(f.store, f.request);
    expect(sparse.readyCommands).toHaveLength(2);
    for (const cmd of sparse.readyCommands) await f.store.execute(cmd);
    const ready = await prepare(f.store, f.request);
    expect(ready.readyCommands).toHaveLength(2);
    for (const cmd of ready.readyCommands) await f.store.execute(cmd);
    for (const cmd of ready.readyCommands) await f.store.execute(cmd);
    const graph = f.store.get<CoreGraph>("graph");
    expect(graph.itinerary_events).toHaveLength(2);
    expect(
      graph.itinerary_events.every(
        (r) =>
          r.semantic_revision === 2 &&
          r.visibility === "PRIVATE" &&
          r.participation_mode === "SELF",
      ),
    ).toBe(true);
    expect(graph.trip_flight_intents.every((r) => r.qualification === "QUALIFIED")).toBe(
      true,
    );
    expect(graph.itinerary_transport_endpoints).toHaveLength(4);
    expect(f.store.db.prepare("SELECT * FROM receipts").all()).toHaveLength(4);
    expect((await prepare(f.store, f.request)).readyCommands).toHaveLength(0);
    f.store.close();
  });
  it("keeps the prerequisite revision and rejects stale update rather than rebasing to latest", async () => {
    const f = await dependencyFixture();
    const p = await prepare(f.store, f.request);
    await f.store.execute(p.readyCommands[0]);
    const graph = f.store.get<CoreGraph>("graph");
    graph.itinerary_events[0].semantic_revision = 2;
    f.store.set("graph", graph);
    const blocked = await prepare(f.store, f.request);
    expect(blocked.readyCommands).toHaveLength(0);
    expect(blocked.reviewSlots[0].errorCode).toBe("REVISION_CONFLICT");
    expect(f.store.get<CoreGraph>("graph").trip_flight_intents[0].qualification).toBe(
      "SPARSE",
    );
    f.store.close();
  });
});
