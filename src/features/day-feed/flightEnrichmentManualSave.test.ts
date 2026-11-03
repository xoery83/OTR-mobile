import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "@/data/repositories/tripCoreV2Repository";
import { createTripRepository } from "@/data/repositories/tripRepository";
import { createLocalManualFlightRepository } from "@/data/repositories/localManualFlightRepository";
import {
  localTestHash,
  localTestStamp,
} from "@/domain/trip/__fixtures__/localCoreAuthority";
import {
  requestSchema,
  responseSchema,
  type Suggestion,
} from "@/domain/intelligence/flightEnrichmentContracts";
import { applyFlightLookup, flightLookupKnownFields } from "./flightEnrichmentDraft";
import {
  emptyFlightSegment,
  flightSegmentFromRead,
  sparseFlightSavePlan,
} from "./manualFlightFormFields";

vi.mock("@/data/files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));

// Same Node SQLite/serialized transaction adapter as the existing Manual Flight tests.
function open(path: string, accountId: string, initialize: boolean) {
  const sql = new DatabaseSync(path);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  const account = async () => accountId;
  const core = createTripCoreV2Repository(
    database,
    account,
    localTestHash,
    () => localTestStamp,
  );
  return {
    sql,
    core,
    trips: createTripRepository(database, account, core, () => localTestStamp),
    flights: createLocalManualFlightRepository(core, account, randomUUID, {
      database,
      scope: (id) =>
        id === accountId ? { accountId, newTripsFrom: "2020-01-01T00:00:00Z" } : null,
    }),
  };
}

it("selected fake Enrichment fields use the original formal Manual queue and survive SQLite cold recovery without qualification", async () => {
  const directory = mkdtempSync(join(tmpdir(), "otr-enrichment-manual-"));
  const path = join(directory, "qa.sqlite"),
    accountId = randomUUID(),
    tripId = randomUUID();
  let database: ReturnType<typeof open> | null = null;
  try {
    database = open(path, accountId, true);
    await database.trips.createTrip({
      tripId,
      operationId: randomUUID(),
      syncFormatVersion: 2,
      destinations: [],
      name: "Synthetic Enrichment Local QA",
      destination: null,
      startDate: null,
      endDate: null,
    });
    const draft = await database.flights.createDraft(tripId);
    expect(draft.persistence).toBe("FORMAL_MANUAL");
    const entered = {
      ...emptyFlightSegment(draft.itemId, "2027-02-06"),
      flightNumberLiteral: "NZ501",
      originCode: "AKL",
      originName: "Auckland International Airport",
      departureZone: "Pacific/Auckland",
      departureTime: "23:10",
    };
    const request = requestSchema.parse({
      version: "otr-flight-enrichment/1",
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      mode: "CREATE",
      draft: { id: draft.itemId, revision: 1 },
      flightNumber: "NZ501",
      departureLocalDate: entered.departureDate,
      knownFields: flightLookupKnownFields(entered),
    });
    const suggestion = (
      field: Suggestion["field"],
      value: string,
      existingValue: string | null = null,
    ): Suggestion => ({
      field,
      value,
      existingValue,
      eligibility: existingValue ? "KEEP_OR_REPLACE" : "ADOPT",
      source: {
        url: "https://example.com/synthetic-flight-fixture",
        evidenceId: "synthetic-evidence",
        quote: "Synthetic QA flight fields, not a real flight schedule.",
        observedAt: "2026-10-19T00:00:00Z",
      },
      applicableDate: { from: null, to: null, requested: entered.departureDate },
      referenceOnly: false,
      reason: existingValue ? "EXISTING_VALUE_CONFLICT" : null,
    });
    // This fixture performs no Search/LLM/network request and has no server receipt.
    const fakeFind = vi.fn(async () =>
      responseSchema.parse({
        version: request.version,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        mode: request.mode,
        draft: request.draft,
        query: {
          flightNumber: request.flightNumber,
          departureLocalDate: request.departureLocalDate,
        },
        status: "PARTIAL",
        advisory: true,
        requiresUserConfirmation: true,
        manualEntryAllowed: true,
        suggestions: [
          suggestion("departureLocalTime", "22:00", "23:10"),
          suggestion("arrivalAirport", "NRT"),
          suggestion("arrivalLocalDate", "2027-02-07"),
          suggestion("arrivalLocalTime", "06:20"),
          suggestion("operatingCarrier", "Synthetic QA Carrier"),
        ],
        references: [],
        unresolved: [],
        candidates: [],
        observedAt: "2026-10-19T00:00:00Z",
        cache: { state: "MISS", freshUntil: null, writes: "CLOSED_LICENSE_UNCONFIRMED" },
        usage: {
          receiptId: null,
          providerId: "synthetic-fixture",
          modelId: null,
          searchCalls: 0,
          llmCalls: 0,
          input_tokens: null,
          output_tokens: null,
          cached_input_tokens: null,
          total_tokens: null,
          knownCostNanos: "0",
          providerCostNanos: null,
          costQuality: "NO_PROVIDER_CALL",
          billingStatus: "NOT_BILLED",
          currency: "USD",
          entitlement: "POLICY_UNFROZEN",
          cacheHit: false,
          metering: "RECORDED",
          stepReceiptIds: [],
        },
        failureReason: null,
      }),
    );
    const response = await fakeFind();
    let selected = structuredClone(entered);
    // Exactly the UI's one-suggestion adoption path. Keep/unselected fields never call Apply.
    for (const field of [
      "arrivalAirport",
      "arrivalLocalDate",
      "arrivalLocalTime",
    ] as const) {
      const one = response.suggestions.find((entry) => entry.field === field)!;
      const changes = applyFlightLookup(
        { ...response, suggestions: [one] },
        request,
        selected,
      );
      expect(changes).not.toBeNull();
      selected = { ...selected, ...changes };
    }
    expect(fakeFind).toHaveBeenCalledOnce();
    expect(entered.arrivalDate).toBe("");
    expect(selected.departureTime).toBe("23:10");
    expect(selected).not.toHaveProperty("operatingCarrier");
    expect(selected.originTerminal).toBe("");
    expect(selected.destinationTerminal).toBe("");
    expect(selected).toMatchObject({
      destinationCode: "NRT",
      arrivalDate: "2027-02-07",
      arrivalTime: "06:20",
      arrivalZone: "Asia/Tokyo",
    });
    const plan = sparseFlightSavePlan([selected]);
    expect(plan.kind).toBe("READY");
    if (plan.kind !== "READY") throw Error("MANUAL_SAVE_NOT_READY");
    expect(plan.fields.origin?.time).toMatchObject({
      local_date: "2027-02-06",
      local_time: "23:10",
      zone_id: "Pacific/Auckland",
      instant: null,
      source_instant: null,
    });
    expect(plan.fields.destination?.time).toMatchObject({
      local_date: "2027-02-07",
      local_time: "06:20",
      zone_id: "Asia/Tokyo",
      instant: null,
      source_instant: null,
    });
    const saved = await database.flights.save(draft, plan.fields, () => true);
    expect(saved).toMatchObject({
      status: "LOCAL_COMMITTED",
      authority: "MANUAL_QUEUE",
      localStatus: "PENDING",
      itemId: draft.itemId,
    });
    expect(saved).not.toHaveProperty("receipt");
    const pending = await database.core.pending(
      await database.core.captureContext(tripId),
    );
    expect(
      pending.map((entry) => [entry.command.command, entry.command.target.id]),
    ).toEqual([
      ["CREATE_SPARSE_FLIGHT", draft.itemId],
      ["SET_AUTHORED_FLIGHT_DETAILS", draft.itemId],
    ]);
    expect(pending.map((entry) => entry.command.command)).not.toContain(
      "SAVE_AUTHORED_FLIGHT_LOCAL",
    );
    database.sql.close();
    database = null;
    database = open(path, accountId, false);
    expect(await database.flights.recover(JSON.parse(JSON.stringify(draft)))).toEqual(
      saved,
    );
    const read = await database.flights.readForForm(tripId, draft.itemId);
    expect(read.itemId).toBe(draft.itemId);
    expect(read.details.qualification).toBe("SPARSE");
    expect(flightSegmentFromRead(read)).toMatchObject({
      ...selected,
      key: draft.itemId,
    });
    const restored = flightSegmentFromRead(read);
    expect(restored.departureDate).toBe("2027-02-06");
    expect(restored.arrivalDate).toBe("2027-02-07");
    expect(restored.departureTime).toBe("23:10");
    expect(restored.arrivalTime).toBe("06:20");
    expect(restored.departureZone).toBe("Pacific/Auckland");
    expect(restored.arrivalZone).toBe("Asia/Tokyo");
    expect(restored.originTerminal).toBe("");
    expect(restored.destinationTerminal).toBe("");
    expect(
      await database.flights.save(
        JSON.parse(JSON.stringify(draft)),
        plan.fields,
        () => true,
      ),
    ).toEqual(saved);
    expect(
      await database.core.pending(await database.core.captureContext(tripId)),
    ).toHaveLength(2);
    expect(
      database.sql.prepare("SELECT count(*) n FROM local_core_authority_commits").get()!
        .n,
    ).toBe(0);
    expect(
      database.sql
        .prepare("SELECT count(*) n FROM trip_core_trip_core_command_receipts")
        .get()!.n,
    ).toBe(0);
  } finally {
    database?.sql.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
