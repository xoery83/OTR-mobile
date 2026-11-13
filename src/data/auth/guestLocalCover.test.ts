import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import * as guestWorkspace from "./guestLocalWorkspace";
import { readLocalTripPhotoRepository } from "../repositories/tripPhotoRepository";
import { readLocalTripPersonalCoverRepository } from "../repositories/tripPersonalCoverRepository";
import { advanceAccountGeneration } from "./accountGeneration";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import type { MigrationDatabase } from "../db/migrationRunner";
import type { RetainedTripPhoto } from "../files/tripPhotoFileStore";
import { tripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";

const state = vi.hoisted(() => ({
  retained: new Map<string, RetainedTripPhoto>(),
  principal: null as LaunchIdentity | null,
  account: vi.fn(() => {
    throw Error("ACCOUNT_DATABASE_FORBIDDEN");
  }),
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: state.account }));
vi.mock("./authRepository", () => ({
  requireActiveUserId: state.account,
  readCommittedLocalPrincipal: vi.fn(async () => state.principal),
  requireCommittedGuestPrincipal: vi.fn(async () => state.principal),
}));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(
    async (input: { accountId: string; tripId: string; assetId: string }) => {
      const photo: RetainedTripPhoto = {
        accountId: input.accountId,
        tripId: input.tripId,
        assetId: input.assetId,
        mimeType: "image/jpeg",
        sizeBytes: 12,
        sha256: "a".repeat(64),
        localUri: `file:///retained/${input.accountId}/${input.tripId}/${input.assetId}.jpg`,
      };
      state.retained.set(photo.localUri, photo);
      return { photo, createdNew: true };
    },
  ),
  resolveRetainedTripPhoto: vi.fn((photo: RetainedTripPhoto) =>
    JSON.stringify(state.retained.get(photo.localUri)) === JSON.stringify(photo)
      ? photo.localUri
      : null,
  ),
  probeRetainedTripPhotoIdentity: vi.fn((photo: RetainedTripPhoto) =>
    state.retained.has(photo.localUri)
      ? {
          uri: photo.localUri,
          sizeBytes: photo.sizeBytes,
          modificationTime: 100,
          creationTime: 50,
        }
      : null,
  ),
  discardRetainedTripPhoto: vi.fn(({ photo }: { photo: RetainedTripPhoto }) =>
    state.retained.delete(photo.localUri),
  ),
}));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
  expect(state.account).not.toHaveBeenCalled();
  state.retained.clear();
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

it("uses current-schema Guest repositories for photo/personal cover, retains IDs after disk reopen, without Cloud or extra queue", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(Error("NETWORK_FORBIDDEN"));
  const f = fixture();
  const workspace = await f.newOpener()();
  const input = tripInput();
  await workspace.trips.createTrip(input);
  expect(
    f.sql().prepare("SELECT MAX(id) AS version FROM schema_migrations").get(),
  ).toEqual({ version: 79 });
  const beforeQueue = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const photo = await workspace.photos.addTripPhoto(
    input.tripId,
    "file:///temporary.jpg",
  );
  const base = (await workspace.personalCover.read(input.tripId))!;
  const raw = tripPhotoCoverRef(photo.assetId);
  await workspace.personalCover.save(base.context, {
    beforeRaw: base.raw,
    expectedAccessToken: base.accessToken,
    expectedRevision: base.selectionRevision,
    after: raw,
  });
  expect(workspace.syncAllowed).toBe(false);
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    beforeQueue,
  );
  f.close();
  const restored = await f.newOpener()();
  expect((await restored.personalCover.read(input.tripId))?.raw).toBe(raw);
  expect(
    await restored.photos.readSelectedTripCoverPhoto(input.tripId, raw),
  ).toMatchObject({
    assetId: photo.assetId,
    tripId: input.tripId,
    sha256: "a".repeat(64),
    localUri: photo.localUri,
  });
  expect((await restored.trips.getTrip(input.tripId))?.id).toBe(input.tripId);
  const selected = (await restored.personalCover.read(input.tripId))!;
  await restored.personalCover.save(selected.context, {
    beforeRaw: raw,
    expectedAccessToken: selected.accessToken,
    expectedRevision: selected.selectionRevision,
    after: null,
  });
  f.close();
  const automatic = await f.newOpener()();
  expect((await automatic.personalCover.read(input.tripId))?.raw).toBeNull();
  expect(
    (await automatic.trips.getTrip(input.tripId))?.selectedCoverAssetIdRaw,
  ).toBeNull();
  expect(await automatic.photos.listTripPhotos(input.tripId)).toHaveLength(1);
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    beforeQueue,
  );
  expect(network).not.toHaveBeenCalled();
});

it("fences Guest A/B and inventory freeze, then restores the same local choice after release", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const input = tripInput();
  await workspace.trips.createTrip(input);
  const photo = await workspace.photos.addTripPhoto(
    input.tripId,
    "file:///temporary.jpg",
  );
  const base = (await workspace.personalCover.read(input.tripId))!;
  const raw = tripPhotoCoverRef(photo.assetId);
  await workspace.personalCover.save(base.context, {
    beforeRaw: base.raw,
    expectedAccessToken: base.accessToken,
    expectedRevision: base.selectionRevision,
    after: raw,
  });
  const frozen = await workspace.freezeForInventory();
  await expect(
    workspace.photos.addTripPhoto(input.tripId, "file:///another.jpg"),
  ).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await expect(workspace.personalCover.read(input.tripId)).rejects.toThrow(
    "GUEST_INVENTORY_FROZEN",
  );
  await frozen.release();
  expect((await workspace.personalCover.read(input.tripId))?.raw).toBe(raw);
  state.principal = { kind: "GUEST", localId: randomUUID() };
  advanceAccountGeneration();
  await expect(workspace.personalCover.read(input.tripId)).rejects.toThrow();
  const other = await f.newOpener()();
  expect(await other.personalCover.read(input.tripId)).toBeNull();
  expect(await other.photos.listTripPhotos(input.tripId)).toEqual([]);
  state.principal = { kind: "GUEST", localId: f.guestId };
  advanceAccountGeneration();
  const back = await f.newOpener()();
  expect((await back.personalCover.read(input.tripId))?.raw).toBe(raw);
});

it("routes both installed default factories to the current Guest workspace without opening Account storage", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const open = vi
    .spyOn(guestWorkspace, "openGuestLocalWorkspace")
    .mockResolvedValue(workspace);
  expect(await readLocalTripPhotoRepository()).toBe(workspace.photos);
  expect(await readLocalTripPersonalCoverRepository()).toBe(workspace.personalCover);
  expect(open).toHaveBeenCalledTimes(2);
});
