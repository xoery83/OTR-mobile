import { tripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import type { RetainTripPhotoResult } from "../files/tripPhotoFileStore";
import {
  createTripPhotoRepository,
  readLocalTripPhotoRepository,
} from "./tripPhotoRepository";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import {
  resolveRetainedTripPhoto,
  probeRetainedTripPhotoIdentity,
} from "../files/tripPhotoFileStore";

vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
const accountA = randomUUID(),
  accountB = randomUUID(),
  tripId = randomUUID();
const photoId = randomUUID(),
  stamp = "2026-10-14T01:00:00Z";
const sha = "a".repeat(64);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "otr-trip-photos-"));
  const path = join(dir, "data.db");
  let sql = new DatabaseSync(path);
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) sql.exec(migration.sql);
  sql
    .prepare(
      "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(accountA, tripId, randomUUID(), "Trip", stamp, stamp);
  let account: string = accountA;
  let failInsert = false;
  let abaRead = false;
  let afterPhotoRead: (() => Promise<void>) | null = null;
  const database = () => ({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const row = (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      if (afterPhotoRead && query.includes("FROM local_trip_photos")) {
        const action = afterPhotoRead;
        afterPhotoRead = null;
        await action();
      }
      return row;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      const rows = sql.prepare(query).all(...(args as never[])) as T[];
      if (abaRead && query.includes("FROM local_trip_photos")) {
        abaRead = false;
        account = accountB;
        advanceAccountGeneration();
        account = accountA;
        advanceAccountGeneration();
      }
      return rows;
    },
    async runAsync(query: string, ...args: unknown[]) {
      if (failInsert && query.startsWith("INSERT INTO local_trip_photos")) {
        failInsert = false;
        throw new Error("INSERT_FAILED");
      }
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
  const retained: RetainTripPhotoResult = {
    photo: {
      accountId: accountA,
      tripId,
      assetId: photoId,
      mimeType: "image/jpeg",
      sizeBytes: 12,
      sha256: sha,
      localUri: "file:///app/trip-photos/image.jpg",
    },
    createdNew: true,
  };
  const files = {
    retainTripPhoto: vi.fn(async () => retained),
    resolveRetainedTripPhoto: vi.fn((): string | null => retained.photo.localUri),
    discardRetainedTripPhoto: vi.fn(() => true),
  };
  return {
    get sql() {
      return sql;
    },
    files,
    retained,
    database,
    getAccount: async () => account,
    afterPhotoRead(action: () => Promise<void>) {
      afterPhotoRead = action;
    },
    repo: () =>
      createTripPhotoRepository(
        database(),
        async () => account,
        files,
        () => photoId,
        () => stamp,
      ),
    account(id: string) {
      account = id;
      advanceAccountGeneration();
    },
    failInsert() {
      failInsert = true;
    },
    abaRead() {
      abaRead = true;
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
    },
    close() {
      sql.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

it("stores a scoped local photo, survives cold reopen, and reports missing bytes honestly", async () => {
  const test = setup();
  try {
    const photo = await test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    expect(photo).toMatchObject({
      assetId: photoId,
      tripId,
      localUri: test.files.resolveRetainedTripPhoto(),
    });
    expect(test.files.retainTripPhoto).toHaveBeenCalledWith({
      accountId: accountA,
      tripId,
      assetId: photoId,
      temporaryUri: "file:///picker/selected.jpg",
    });
    expect(test.files.discardRetainedTripPhoto).not.toHaveBeenCalled();
    test.reopen();
    expect(await test.repo().listTripPhotos(tripId)).toHaveLength(1);
    test.sql
      .prepare(
        "UPDATE local_trip_photos SET local_uri=? WHERE account_id=? AND trip_id=?",
      )
      .run("file:///untrusted/location.jpg", accountA, tripId);
    expect(await test.repo().listTripPhotos(tripId)).toMatchObject([
      { assetId: photoId, localUri: null },
    ]);
    test.sql
      .prepare(
        "UPDATE local_trip_photos SET local_uri=? WHERE account_id=? AND trip_id=?",
      )
      .run(test.retained.photo.localUri, accountA, tripId);
    test.files.resolveRetainedTripPhoto.mockReturnValue(null);
    expect(await test.repo().listTripPhotos(tripId)).toMatchObject([
      { assetId: photoId, localUri: null },
    ]);
    expect(test.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() =>
      test.sql
        .prepare(
          "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(accountB, tripId, randomUUID(), "image/jpeg", 12, sha, "file:///x", stamp),
    ).toThrow(/FOREIGN KEY/);
    test.account(accountB);
    expect(await test.repo().listTripPhotos(tripId)).toEqual([]);
    await expect(
      test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg"),
    ).rejects.toThrow("TRIP_LOCAL_RECORD_MISSING");
  } finally {
    test.close();
  }
});

it("discards only a newly retained file when SQLite insert rolls back", async () => {
  const test = setup();
  try {
    test.failInsert();
    await expect(
      test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg"),
    ).rejects.toThrow("INSERT_FAILED");
    expect(test.files.discardRetainedTripPhoto).toHaveBeenCalledTimes(1);
    expect(test.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual(
      { n: 0 },
    );
    test.files.retainTripPhoto.mockResolvedValueOnce({
      photo: test.retained.photo,
      createdNew: false,
    });
    test.failInsert();
    await expect(
      test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg"),
    ).rejects.toThrow("INSERT_FAILED");
    expect(test.files.discardRetainedTripPhoto).toHaveBeenCalledTimes(1);
  } finally {
    test.close();
  }
});

it("aborts a stale account generation after file retention and cleans the fresh copy", async () => {
  const test = setup();
  try {
    test.files.retainTripPhoto.mockImplementationOnce(async () => {
      test.account(accountB);
      test.account(accountA);
      return {
        photo: {
          accountId: accountA,
          tripId,
          assetId: photoId,
          mimeType: "image/jpeg",
          sizeBytes: 12,
          sha256: sha,
          localUri: "file:///app/trip-photos/image.jpg",
        },
        createdNew: true,
      };
    });
    await expect(
      test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg"),
    ).rejects.toThrow("Account changed");
    expect(test.files.discardRetainedTripPhoto).toHaveBeenCalledTimes(1);
    expect(test.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual(
      { n: 0 },
    );
  } finally {
    test.close();
  }
});

it("keeps a committed association and retained file if the final read fails", async () => {
  const test = setup();
  try {
    test.files.resolveRetainedTripPhoto.mockImplementationOnce(() => {
      throw new Error("FINAL_READ_FAILED");
    });
    await expect(
      test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg"),
    ).resolves.toMatchObject({ assetId: photoId, localUri: null });
    expect(test.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual(
      {
        n: 1,
      },
    );
    expect(test.files.discardRetainedTripPhoto).not.toHaveBeenCalled();
    expect(await test.repo().listTripPhotos(tripId)).toHaveLength(1);
  } finally {
    test.close();
  }
});

it("rejects a prior Account generation even when the same Account returns before list completion", async () => {
  const test = setup();
  try {
    await test.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    test.abaRead();
    await expect(test.repo().listTripPhotos(tripId)).rejects.toThrow("Account changed");
  } finally {
    test.close();
  }
});

it("resolves only a current same-Trip retained cover photo across cold reopen", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    expect(
      f.sql
        .prepare(
          "SELECT selected_cover_asset_id FROM local_trip_containers WHERE account_id=? AND id=?",
        )
        .get(accountA, tripId),
    ).toEqual({ selected_cover_asset_id: null });
    const ref = tripPhotoCoverRef(photoId);
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, ref)).toMatchObject({
      assetId: photoId,
      localUri: f.retained.photo.localUri,
    });
    f.reopen();
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, ref)).toMatchObject({
      assetId: photoId,
    });
    expect(await f.repo().readSelectedTripCoverPhoto(randomUUID(), ref)).toBeNull();
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, "city")).toBeNull();
    expect(
      await f.repo().readSelectedTripCoverPhoto(tripId, ref.toUpperCase()),
    ).toBeNull();
    f.account(accountB);
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, ref)).toBeNull();
    f.account(accountA);
    f.files.resolveRetainedTripPhoto.mockReturnValue(null);
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, ref)).toBeNull();
    f.files.resolveRetainedTripPhoto.mockReturnValue(f.retained.photo.localUri);
    f.sql
      .prepare(
        "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,1,1)",
      )
      .run(accountA, tripId);
    expect(await f.repo().readSelectedTripCoverPhoto(tripId, ref)).toBeNull();
  } finally {
    f.close();
  }
});
it("rejects a selected-photo result after Account ABA during file verification", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    f.files.resolveRetainedTripPhoto.mockImplementationOnce(() => {
      f.account(accountB);
      f.account(accountA);
      return f.retained.photo.localUri;
    });
    await expect(
      f.repo().readSelectedTripCoverPhoto(tripId, tripPhotoCoverRef(photoId)),
    ).rejects.toThrow("Account changed");
  } finally {
    f.close();
  }
});

function enableCache(f: ReturnType<typeof setup>) {
  let identity: {
    uri: string;
    sizeBytes: number;
    modificationTime: number;
    creationTime: number;
  } | null = {
    uri: f.retained.photo.localUri,
    sizeBytes: 12,
    modificationTime: 100,
    creationTime: 50,
  };
  const probe = vi.fn(() => identity);
  const files = { ...f.files, probeRetainedTripPhotoIdentity: probe };
  return {
    files,
    probe,
    identity(value: typeof identity) {
      identity = value;
    },
    repo: () => createTripPhotoRepository(f.database(), f.getAccount, files),
  };
}

it("reuses one full verification across warm factory remounts, including chooser cancellation", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    f.files.resolveRetainedTripPhoto.mockClear();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toMatchObject({
      assetId: photoId,
    });
    // Opening/canceling a chooser performs no committed-selection invalidation.
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, "city")).toBeNull();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toMatchObject({
      assetId: photoId,
    });
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
    expect(c.probe).toHaveBeenCalledTimes(4);
    const context = await captureAccountRequestContext(tripId, f.getAccount);
    await c.repo().invalidateSelectedTripCoverPhotoAfterCommit(context);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).not.toBeNull();
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(2);
  } finally {
    f.close();
  }
});

it("shares the installed default factory cache but isolates injected file stores", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    vi.mocked(requireActiveUserId).mockImplementation(f.getAccount);
    vi.mocked(readInitializedDatabase).mockResolvedValue(f.database() as never);
    vi.mocked(resolveRetainedTripPhoto)
      .mockReset()
      .mockReturnValue(f.retained.photo.localUri);
    vi.mocked(probeRetainedTripPhotoIdentity).mockReturnValue({
      uri: f.retained.photo.localUri,
      sizeBytes: 12,
      modificationTime: 100,
      creationTime: 50,
    });
    const raw = tripPhotoCoverRef(photoId);
    expect(
      await (
        await readLocalTripPhotoRepository()
      ).readSelectedTripCoverPhoto(tripId, raw),
    ).not.toBeNull();
    expect(
      await (
        await readLocalTripPhotoRepository()
      ).readSelectedTripCoverPhoto(tripId, raw),
    ).not.toBeNull();
    expect(resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
    const c = enableCache(f);
    f.files.resolveRetainedTripPhoto.mockClear();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).not.toBeNull();
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});

it("rehashes changed same-size timestamps and never caches missing/unknown signatures", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    f.files.resolveRetainedTripPhoto.mockClear();
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    c.identity({
      uri: f.retained.photo.localUri,
      sizeBytes: 12,
      modificationTime: 101,
      creationTime: 50,
    });
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(2);
    c.identity(null);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(4);
    f.files.resolveRetainedTripPhoto.mockReturnValue(null);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
  } finally {
    f.close();
  }
});

it("never publishes or caches a file whose identity changes during full verification", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    f.files.resolveRetainedTripPhoto.mockImplementationOnce(() => {
      c.identity({
        uri: f.retained.photo.localUri,
        sizeBytes: 12,
        modificationTime: 101,
        creationTime: 50,
      });
      return f.retained.photo.localUri;
    });
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    f.files.resolveRetainedTripPhoto.mockClear();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).not.toBeNull();
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});

it("revalidates changed access revision and selection row; revoked/deleted scope cannot reuse a photo", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    f.files.resolveRetainedTripPhoto.mockClear();
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.sql
      .prepare(
        "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,1,0)",
      )
      .run(accountA, tripId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.sql
      .prepare(
        "UPDATE trip_core_scopes SET access_revision=2,refresh_generation=2 WHERE account_id=? AND trip_id=?",
      )
      .run(accountA, tripId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.sql
      .prepare(
        "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
      )
      .run(raw, accountA, tripId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(4);
    f.sql
      .prepare("UPDATE trip_core_scopes SET revoked=1 WHERE account_id=? AND trip_id=?")
      .run(accountA, tripId);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    f.sql
      .prepare("UPDATE trip_core_scopes SET revoked=0 WHERE account_id=? AND trip_id=?")
      .run(accountA, tripId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.sql
      .prepare("DELETE FROM local_trip_containers WHERE account_id=? AND id=?")
      .run(accountA, tripId);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
  } finally {
    f.close();
  }
});

it("rejects changed/deleted photo rows and same Account ABA during an awaited warm read", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.afterPhotoRead(async () => {
      f.sql
        .prepare("UPDATE local_trip_photos SET sha256=? WHERE account_id=? AND trip_id=?")
        .run("b".repeat(64), accountA, tripId);
    });
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    f.afterPhotoRead(async () => {
      f.account(accountB);
      f.account(accountA);
    });
    await expect(c.repo().readSelectedTripCoverPhoto(tripId, raw)).rejects.toThrow(
      "Account changed",
    );
    f.sql
      .prepare("DELETE FROM local_trip_photos WHERE account_id=? AND trip_id=?")
      .run(accountA, tripId);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
  } finally {
    f.close();
  }
});

it("rejects an in-flight lease invalidated after a committed same-photo rechoose", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    const context = await captureAccountRequestContext(tripId, f.getAccount);
    f.afterPhotoRead(async () => {
      await c.repo().invalidateSelectedTripCoverPhotoAfterCommit(context);
    });
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).not.toBeNull();
    f.account(accountB);
    await expect(
      c.repo().invalidateSelectedTripCoverPhotoAfterCommit(context),
    ).rejects.toThrow("Account changed");
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    expect(await c.repo().readSelectedTripCoverPhoto(randomUUID(), raw)).toBeNull();
  } finally {
    f.close();
  }
});

it("denies revoked scope and a disappeared file during otherwise warm navigation", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    f.afterPhotoRead(async () => {
      f.sql
        .prepare(
          "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,1,1)",
        )
        .run(accountA, tripId);
    });
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
    f.sql
      .prepare("UPDATE trip_core_scopes SET revoked=0 WHERE account_id=? AND trip_id=?")
      .run(accountA, tripId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    c.identity(null);
    f.files.resolveRetainedTripPhoto.mockReturnValue(null);
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).toBeNull();
  } finally {
    f.close();
  }
});

it("rejects a deferred warm row read after Account switches away and back", async () => {
  const f = setup();
  try {
    await f.repo().addTripPhoto(tripId, "file:///picker/selected.jpg");
    const c = enableCache(f),
      raw = tripPhotoCoverRef(photoId);
    await c.repo().readSelectedTripCoverPhoto(tripId, raw);
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.afterPhotoRead(() => {
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const pending = c.repo().readSelectedTripCoverPhoto(tripId, raw);
    await waiting;
    f.account(accountB);
    f.account(accountA);
    release();
    await expect(pending).rejects.toThrow("Account changed");
    f.files.resolveRetainedTripPhoto.mockClear();
    expect(await c.repo().readSelectedTripCoverPhoto(tripId, raw)).not.toBeNull();
    expect(f.files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});
