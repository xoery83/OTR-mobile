import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createNativeQaPreOtpCensus,
  projectNativeQaPreOtpCensus,
  readCurrentNativeQaPreOtpCensus,
} from "./nativeQaPreOtpCensus";
import { createGuestTripDraftInventory } from "../auth/guestTripDraftInventory";
import { createGuestP1DraftInventory } from "../auth/guestP1DraftInventory";
import type { GuestLocalWorkspace } from "../auth/guestLocalWorkspace";
const runtime = vi.hoisted(() => ({
  principal: null as { kind: "GUEST"; localId: string } | null,
  owner: null as any,
  database: null as any,
  failDatabase: false,
}));
vi.mock("../auth/authRepository", () => ({
  readCommittedLocalPrincipal: async () => runtime.principal,
  requireCommittedGuestPrincipal: async () => runtime.principal,
}));
vi.mock("../auth/guestLocalWorkspace", () => ({
  readInitializedGuestOwner: async () => runtime.owner,
}));
vi.mock("../auth/guestRecoveryFiles", () => ({
  createGuestRecoveryFiles: () => ({ listAttempts: async () => [] }),
}));
vi.mock("../db/database", () => ({
  readInitializedDatabase: async () => {
    if (runtime.failDatabase) throw Error("DATABASE_NOT_INITIALIZED");
    return runtime.database;
  },
}));
function fixture() {
  let generation = 7;
  let principal: { kind: "GUEST"; localId: string } | null = {
    kind: "GUEST",
    localId: randomUUID(),
  };
  const scope = { ...principal!, generation };
  const trip = createGuestTripDraftInventory(async () => {});
  const p1 = createGuestP1DraftInventory(async () => {});
  const dataset: Awaited<ReturnType<GuestLocalWorkspace["readCensus"]>> = {
    schemaId: "otr.auth.guest-census/1",
    scope,
    sqliteVersion: 76,
    tripIds: [],
    tables: [{ name: "sync_operations", rows: 0, sha256: null }],
    blockers: ["FILE_AND_LIVE_DRAFT_COLLECTORS_REQUIRED"],
    readyForServerPreflight: false,
    inventorySha256: null,
    totals: {
      trips: 0,
      people: 0,
      p1Items: 0,
      files: null,
      fileBytes: null,
      liveDrafts: null,
    },
  };
  const capture: Awaited<ReturnType<GuestLocalWorkspace["readCaptureInventory"]>> = {
    schemaId: "otr.auth.guest-capture-inventory/1",
    coverage: "CAPTURE_ONLY",
    scope,
    status: "CAPTURE_COMPLETE",
    sqliteVersion: 76,
    entries: [],
    orphanPayloads: 0,
    totalPayloads: 0,
    verifiedBytes: 0,
    blockers: [],
    inventorySha256: "a".repeat(64),
  };
  const owner = {
    scope,
    readCensus: vi.fn(async () => structuredClone(dataset)),
    readCaptureInventory: vi.fn(async () => capture),
  };
  const readOwner = vi.fn(async () => owner);
  const recovery = vi.fn(async () => [] as string[]);
  const deps = {
    readPrincipal: vi.fn(async () => principal),
    generation: () => generation,
    readBootstrappedGuestOwner: readOwner,
    tripDrafts: trip.readParticipantCensus,
    p1Drafts: p1.readParticipantCensus,
    readRecoveryAttempts: recovery,
  };
  return {
    scope,
    trip,
    p1,
    dataset,
    capture,
    owner,
    readOwner,
    recovery,
    deps,
    switch: () => {
      generation++;
      principal = { kind: "GUEST", localId: randomUUID() };
    },
    clear: () => {
      principal = null;
    },
  };
}
it("calls actual Auth readonly registry API; preserves unknown external files/account coverage instead of fake zero", async () => {
  const f = fixture();
  const result = await createNativeQaPreOtpCensus(f.deps)();
  expect(result).toMatchObject({
    status: "UNKNOWN",
    reason: "INCOMPLETE_OWNER_COVERAGE",
    authOrAdoptionAuthority: false,
    coverage: {
      externalFilesAndDrafts: { status: "UNKNOWN", files: null, liveDrafts: null },
      account: {
        status: "UNKNOWN",
        coreIntentRows: null,
        unfinishedOperations: null,
      },
      tripDraftRegistrations: { registeredParticipantCount: 0, registrationVersion: 0 },
      capture: { coverage: "CAPTURE_ONLY" },
    },
  });
});
it("missing initialized owner never opens or invents Guest state", async () => {
  const f = fixture();
  expect(
    await createNativeQaPreOtpCensus({
      ...f.deps,
      readBootstrappedGuestOwner: async () => null,
    })(),
  ).toEqual({ status: "UNKNOWN", reason: "BOOTSTRAPPED_GUEST_OWNER_UNAVAILABLE" });
  expect(f.owner.readCensus).not.toHaveBeenCalled();
  expect(f.recovery).not.toHaveBeenCalled();
});
it("null committed principal is not empty", async () => {
  const f = fixture();
  f.clear();
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "CURRENT_PRINCIPAL_NOT_GUEST",
  });
  expect(f.readOwner).not.toHaveBeenCalled();
});
it("does not snapshot/freeze a registered editor; records QA stop even while other coverage is unknown", async () => {
  const f = fixture();
  const freeze = vi.fn(() => {
    throw Error("NEVER_FREEZE");
  });
  f.trip.register({ freeze });
  expect(await createNativeQaPreOtpCensus(f.deps)()).toMatchObject({
    status: "STOP_NONEMPTY",
    reason: "MEASURED_NONEMPTY",
  });
  expect(freeze).not.toHaveBeenCalled();
});
it("does not release or bypass an existing handoff", async () => {
  const f = fixture();
  const lease = f.trip.freezeEmpty();
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "GUEST_DRAFT_HANDOFF_ACTIVE",
  });
  expect(() => f.trip.freezeEmpty()).toThrow();
  lease.release();
});
it("rejects account/generation switch without returning old counts", async () => {
  const f = fixture();
  f.owner.readCensus.mockImplementationOnce(async () => {
    f.switch();
    return structuredClone(f.dataset);
  });
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "NATIVE_QA_CENSUS_SCOPE_CHANGED",
  });
});
it("rejects wrong existing handle without invoking it", async () => {
  const f = fixture();
  f.owner.scope = { ...f.scope, localId: randomUUID() };
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "BOOTSTRAPPED_GUEST_OWNER_SCOPE_MISMATCH",
  });
  expect(f.owner.readCensus).not.toHaveBeenCalled();
});
it("registration ABA or dataset change invalidates collected observations", async () => {
  const f = fixture();
  f.owner.readCaptureInventory.mockImplementationOnce(async () => {
    const off = f.trip.register({
      freeze: () => {
        throw Error("NEVER_FREEZE");
      },
    });
    off();
    return f.capture;
  });
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "OWNER_OBSERVATION_CHANGED",
  });
});
it("nonzero PROCESSING/UNKNOWN row or recovery attempt stops QA without resetting anything", async () => {
  const f = fixture();
  f.dataset.tables[0].rows = 1;
  f.recovery.mockResolvedValue([randomUUID()]);
  expect(await createNativeQaPreOtpCensus(f.deps)()).toMatchObject({
    status: "STOP_NONEMPTY",
    coverage: { guestTables: { nonBookkeepingRows: 1 }, recovery: { attempts: 1 } },
  });
});
it("never returns a private error body or fabricates successful coverage on failure", async () => {
  const f = fixture();
  f.recovery.mockRejectedValue(Error("private data in error body"));
  expect(await createNativeQaPreOtpCensus(f.deps)()).toEqual({
    status: "UNKNOWN",
    reason: "OWNER_READ_FAILED",
  });
});
it("can report only QA observation, not Auth authority, when actual complete owner fixtures are all zero", async () => {
  const f = fixture();
  f.dataset.blockers = [];
  f.dataset.totals.files = f.dataset.totals.fileBytes = f.dataset.totals.liveDrafts = 0;
  const result = await createNativeQaPreOtpCensus({
    ...f.deps,
    readAccountCoverage: async () => ({
      coverage: "ACCOUNT_NAMESPACE_QUEUE_AND_CORE_METADATA",
      status: "COMPLETE",
      coreIntentRows: 0,
      unfinishedOperations: 0,
    }),
  })();
  expect(result).toMatchObject({
    status: "OBSERVED_EMPTY_QA_ONLY",
    authOrAdoptionAuthority: false,
  });
});

it("diagnostic projection drops IDs, owner context and unrecognized raw reason strings", async () => {
  const f = fixture();
  const value = await createNativeQaPreOtpCensus(f.deps)();
  const projected = projectNativeQaPreOtpCensus(value);
  const text = JSON.stringify(projected);
  expect(text).not.toContain(f.scope.localId);
  expect(text).not.toContain("registrySchemaId");
  expect(projected).toMatchObject({
    principalKind: "GUEST",
    generationStable: true,
    observedGeneration: f.scope.generation,
    counts: { externalFiles: null, accountCoreIntentRows: null },
  });
  expect(
    projectNativeQaPreOtpCensus({
      status: "UNKNOWN",
      reason: "EXAMPLE_PRIVATE_EXCEPTION",
    }),
  ).toMatchObject({
    reason: "OWNER_READ_FAILED",
    principalKind: "UNKNOWN",
    generationStable: null,
  });
});

it("actual default composition borrows initialized owners and both exact Queue/Core metadata readers", async () => {
  const f = fixture();
  f.scope.generation = 0;
  runtime.principal = { kind: "GUEST", localId: f.scope.localId };
  runtime.owner = f.owner;
  runtime.failDatabase = false;
  runtime.database = {
    getAllAsync: vi.fn(async (sql: string) => {
      expect(sql).toContain("GROUP BY");
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("LIMIT");
      expect(sql).not.toContain("payload");
      return [];
    }),
  };
  const result = await readCurrentNativeQaPreOtpCensus();
  expect(runtime.database.getAllAsync).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    status: "UNKNOWN",
    coverage: {
      account: {
        status: "COMPLETE",
        unfinishedOperations: 0,
        coreIntentRows: 0,
        coreIntents: { coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES", total: 0 },
        syncOperations: {
          coverage: "ALL_ACCOUNTS_SYNC_OPERATIONS_ONLY",
          corePendingIntents: "NOT_INCLUDED",
        },
      },
    },
  });
});
it("actual default composition never opens/migrates a missing Account DB or fills the failure with zero", async () => {
  const f = fixture();
  f.scope.generation = 0;
  runtime.principal = { kind: "GUEST", localId: f.scope.localId };
  runtime.owner = f.owner;
  runtime.failDatabase = true;
  expect(await readCurrentNativeQaPreOtpCensus()).toMatchObject({
    status: "UNKNOWN",
    reason: "INCOMPLETE_OWNER_COVERAGE",
    coverage: {
      guestTables: { status: "COMPLETE", nonBookkeepingRows: 0 },
      account: {
        status: "UNKNOWN",
        reason: "DATABASE_NOT_INITIALIZED",
        unfinishedOperations: null,
        coreIntentRows: null,
      },
    },
  });
  runtime.failDatabase = false;
});

it("Account owner failure during an Account switch still discards all old Guest facts", async () => {
  const f = fixture();
  const result = await createNativeQaPreOtpCensus({
    ...f.deps,
    readAccountCoverage: async () => {
      f.switch();
      throw Error("DATABASE_NOT_INITIALIZED");
    },
  })();
  expect(result).toEqual({ status: "UNKNOWN", reason: "NATIVE_QA_CENSUS_SCOPE_CHANGED" });
});
