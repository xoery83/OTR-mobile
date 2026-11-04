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
