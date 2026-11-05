import { getAccountGeneration } from "./accountGeneration";
import {
  dayHeaderDestinationRead,
  resolveDayHeaderDestination,
} from "@/features/day-feed/dayHeaderDestinationRead";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import * as guestWorkspace from "./guestLocalWorkspace";
import {
  createDefaultManualStayRepository,
  createDefaultManualPlanRepository,
  readTripDayFeed,
  confirmGuestStaySaved,
} from "./localTripAccess";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import type { MigrationDatabase } from "../db/migrationRunner";

const state = vi.hoisted(() => ({
  principal: null as LaunchIdentity | null,
  account: vi.fn(() => {
    throw Error("ACCOUNT_DATABASE_FORBIDDEN");
  }),
}));
vi.mock("../sync/nativeTripQaScope", () => ({ kickNativeTripQaSync: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: state.account }));
vi.mock("./authRepository", () => ({
  requireActiveUserId: state.account,
  readCommittedLocalPrincipal: vi.fn(async () => state.principal),
  requireCommittedGuestPrincipal: vi.fn(async () => state.principal),
}));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: state.account,
  resolveRetainedTripPhoto: state.account,
  probeRetainedTripPhotoIdentity: state.account,
  discardRetainedTripPhoto: state.account,
}));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
  expect(state.account).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-guest-cover-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const opened: DatabaseSync[] = [];
  const close = () => opened.splice(0).forEach((sql) => sql.close());
  cleanups.push(close);
  const guestId = randomUUID();
  state.principal = { kind: "GUEST", localId: guestId };
  const connect = async (name: string): Promise<CoreDatabase & MigrationDatabase> => {
    const sql = new DatabaseSync(join(directory, name));
    opened.push(sql);
    sql.exec("PRAGMA foreign_keys=ON");
    return {
      async execAsync(query) {
        sql.exec(query);
      },
      async getFirstAsync<T>(query: string, ...args: unknown[]) {
        return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(query: string, ...args: unknown[]) {
        return sql.prepare(query).all(...(args as never[])) as T[];
      },
      async runAsync(query: string, ...args: unknown[]) {
        return sql.prepare(query).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work) {
        sql.exec("BEGIN");
        try {
          await work();
          sql.exec("COMMIT");
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    };
  };
  const newOpener = () =>
    createGuestLocalWorkspaceOpener({
      readPrincipal: async () => state.principal,
      open: connect,
      recoveryFiles: () => ({
        async listAttempts() {
          return [];
        },
        async read() {
          return null;
        },
        async create() {
          throw Error("RECOVERY_WRITE_FORBIDDEN");
        },
      }),
    });
  return { guestId, newOpener, close, sql: () => opened[0] };
}
const tripInput = () => ({
  tripId: randomUUID(),
  operationId: randomUUID(),
  name: "Guest cover trip",
  creatorDisplayName: "旅人",
  destination: null,
  startDate: null,
  endDate: null,
});

it("Guest P3 reuses Stay/Core/Queue and preserves the same Item through disk reopen, edit and census rejection", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  vi.spyOn(guestWorkspace, "openGuestLocalWorkspace").mockResolvedValue(workspace);
  const stay = await createDefaultManualStayRepository();
  const draft = await stay.createDraft(trip.tripId);
  expect(draft.participantOptions.length).toBeGreaterThan(0);
  const saved = await stay.save(draft, {
    ...draft.fields,
    title: "Guest harbour stay",
    startDate: "2026-11-08",
    endDate: "2026-11-10",
    startTime: "17:00",
    endTime: "10:00",
  });
  expect(saved.localStatus).toBe("PENDING");
  const read = await workspace.days.trip(trip.tripId);
  expect(
    read.localManual?.items.find((item) => item.itemId === saved.itemId),
  ).toMatchObject({ family: "P3", title: "Guest harbour stay", localState: "PENDING" });
  const edit = await stay.read(trip.tripId, saved.itemId);
  const beforeCancel = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  // Opening/abandoning a draft writes no Item or Operation.
  expect(edit.fields.startTime).toBe("17:00");
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    beforeCancel,
  );
  await stay.save(edit, { ...edit.fields, description: "Keep local notes" });
  const census = await workspace.readCensus();
  expect(
    census.blockers.some((b) => JSON.stringify(b).includes("UNSUPPORTED_CORE_FAMILY")),
  ).toBe(true);
  await confirmGuestStaySaved(trip.tripId, saved.itemId);
  expect(workspace.syncAllowed).toBe(false);
  f.close();
  const reopened = await f.newOpener()();
  const restored = await reopened.stay.read(trip.tripId, saved.itemId);
  expect(restored.fields).toMatchObject({
    title: "Guest harbour stay",
    description: "Keep local notes",
    startDate: "2026-11-08",
    endDate: "2026-11-10",
    startTime: "17:00",
    endTime: "10:00",
  });
  expect(restored.itemId).toBe(saved.itemId);
});

it("normal Guest P1 same-address Apple confirmation shares P3 city projection and survives its own disk reopen", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const trip = { ...tripInput(), startDate: "2026-11-05", endDate: "2026-11-08" };
  await workspace.trips.createTrip(trip);
  const ownerBefore = structuredClone(state.principal);
  const opened = vi
    .spyOn(guestWorkspace, "openGuestLocalWorkspace")
    .mockResolvedValue(workspace);
  const plans = await createDefaultManualPlanRepository(),
    draft = await plans.createDraft(trip.tripId);
  const address = "181 Westhaven Dr, Westhaven, Auckland 1011, New Zealand";
  const selection = (itemId: string) => ({
    intent: "ACCEPT_SELECTED_APPLE_PLACE_V1" as const,
    draft: {
      authority: "UNACCEPTED_PROVIDER_DRAFT" as const,
      binding: {
        tripId: trip.tripId,
        itemId,
        accountGeneration: getAccountGeneration(),
        inputRevision: 1,
        location: address,
      },
      provider: "apple" as const,
      selectionSessionId: randomUUID(),
      selectionGeneration: 1,
      addressComponents: {
        locality: "Auckland",
        administrativeArea: "Auckland",
        country: "New Zealand",
        countryCode: "NZ",
      },
      point: { latitude: -36.836, longitude: 174.747 },
    },
  });
  const input = {
    ...draft.fields,
    title: "Guest Harbour Walk",
    startDate: "2026-11-05",
    endDate: "2026-11-05",
    location: address,
  };
  const legacy = await plans.save(draft, input);
  const plainRead = await (await readTripDayFeed()).trip(trip.tripId);
  expect(
    resolveDayHeaderDestination(dayHeaderDestinationRead(plainRead)!, "2026-11-05").kind,
  ).toBe("unresolved");
  const edit = await plans.read(trip.tripId, legacy.itemId);
  expect(edit.fields.location).toBe(address);
  const selected = selection(edit.itemId),
    saved = await plans.save(edit, edit.fields, selected);
  expect(saved).toMatchObject({ itemId: draft.itemId, localStatus: "PENDING" });
  expect(await plans.save(edit, edit.fields, selected)).toEqual(saved);
  const days = await readTripDayFeed();
  const read = await days.trip(trip.tripId);
  expect(read.scope.accountId).toBe(f.guestId);
  expect(
    read.localManual?.items.find((item) => item.itemId === draft.itemId)?.place,
  ).toMatchObject({
    acceptedAddressLocality: "Auckland",
    acceptedAddressCountry: "New Zealand",
    spatialProvenanceRefs: {
      source: "MANUAL_USER_REVIEWED_APPLE_SELECTION_V1",
      acceptance: "USER_CONFIRMED_SAVE",
    },
  });
  expect(
    resolveDayHeaderDestination(dayHeaderDestinationRead(read)!, "2026-11-05"),
  ).toEqual({ kind: "single", source: "activity", label: "Auckland" });
  expect(
    resolveDayHeaderDestination(dayHeaderDestinationRead(read)!, "2026-11-06").kind,
  ).toBe("unresolved");
  const stay = await createDefaultManualStayRepository(),
    sd = await stay.createDraft(trip.tripId);
  await stay.save(
    sd,
    {
      ...sd.fields,
      title: "Guest Harbour Stay",
      startDate: "2026-11-06",
      endDate: "2026-11-08",
      location: address,
    },
    selection(sd.itemId),
  );
  expect(
    resolveDayHeaderDestination(
      dayHeaderDestinationRead(await days.trip(trip.tripId))!,
      "2026-11-06",
    ),
  ).toEqual({ kind: "single", source: "stay", label: "Auckland" });
  const census = await workspace.readCensus();
  expect(census.blockers).toContain("UNSUPPORTED_CORE_FAMILY");
  expect(workspace.syncAllowed).toBe(false);
  expect(state.principal).toEqual(ownerBefore);
  f.close();
  const reopened = await f.newOpener()();
  opened.mockResolvedValue(reopened);
  const recoveredPlans = await createDefaultManualPlanRepository();
  expect((await recoveredPlans.read(trip.tripId, saved.itemId)).fields).toMatchObject(
    input,
  );
  const recoveredRead = await (await readTripDayFeed()).trip(trip.tripId);
  expect(
    recoveredRead.localManual?.items.filter((item) => item.itemId === saved.itemId),
  ).toHaveLength(1);
  expect(
    resolveDayHeaderDestination(dayHeaderDestinationRead(recoveredRead)!, "2026-11-05"),
  ).toEqual({ kind: "single", source: "activity", label: "Auckland" });
  expect(
    resolveDayHeaderDestination(dayHeaderDestinationRead(recoveredRead)!, "2026-11-06"),
  ).toEqual({ kind: "single", source: "stay", label: "Auckland" });
  expect(reopened.syncAllowed).toBe(false);
  expect(state.principal).toEqual(ownerBefore);
});
