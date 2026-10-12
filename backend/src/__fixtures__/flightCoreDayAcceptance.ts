import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "../app";
import type { CoreHttpConnection } from "../tripCoreV2Http";
import type { ImportHash } from "../../../src/domain/trip/flightImportReview";
import { createCoreV2Transport } from "../../../src/data/api/tripCoreV2Transport";
import { migrations } from "../../../src/data/db/migrations";
import { serializeDatabaseTransactions } from "../../../src/data/db/databaseConnection";
import { readInitializedDatabase } from "../../../src/data/db/database";
import { requireActiveUserId } from "../../../src/data/auth/authRepository";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../../../src/data/repositories/tripCoreV2Repository";
import { readTripDayFeed } from "../../../src/data/repositories/tripDayFeedRepository";
import { DayFeed } from "../../../src/features/day-feed/DayFeed";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
export async function verifyJoinedFlightDay({
  core,
  hash,
  accountId,
  otherAccountId,
  tripId,
  expected,
  privateIds,
}: {
  core: () => CoreHttpConnection;
  hash: ImportHash;
  accountId: string;
  otherAccountId: string;
  tripId: string;
  expected: { itemId: string; semanticRevision: number; localDate: string }[];
  privateIds: string[];
}) {
  const directory = mkdtempSync(join(tmpdir(), "otr-flight-ab-"));
  const path = join(directory, "mirror.db");
  let sql: DatabaseSync | undefined,
    activeAccount = accountId,
    offline = false,
    loseCollection = false;
  let collectionReads = 0;
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: async (token: string) => {
        const id = token.replace(/^joined:/, "");
        return token === `joined:${id}` && [accountId, otherAccountId].includes(id)
          ? { id }
          : null;
      },
      canReadTrip: async (a: string, t: string) =>
        t === tripId && [accountId, otherAccountId].includes(a),
    } as unknown as DevBackendGateway,
    coreConnection: core(),
  });
  const transport = createCoreV2Transport(
    async () => activeAccount,
    hash,
    {
      baseUrl: "http://flight-ab.synthetic",
      fetchImplementation: async (input, init) => {
        if (offline) throw new TypeError("SYNTHETIC_OFFLINE");
        collectionReads++;
        const response = await handler(new Request(input, init));
        if (loseCollection && response.ok) {
          loseCollection = false;
          throw new TypeError("SYNTHETIC_COLLECTION_RESPONSE_LOSS");
        }
        return response;
      },
    },
    async () => ({ token: `joined:${activeAccount}`, userId: activeAccount }),
  );
  function open(initialize: boolean) {
    sql = new DatabaseSync(path);
    sql.exec("PRAGMA foreign_keys=ON");
    if (initialize) for (const migration of migrations) sql.exec(migration.sql);
    const database: CoreDatabase = serializeDatabaseTransactions({
      async getFirstAsync<T>(query: string, ...args: unknown[]) {
        return (sql!.prepare(query).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(query: string, ...args: unknown[]) {
        return sql!.prepare(query).all(...(args as never[])) as T[];
      },
      async runAsync(query: string, ...args: unknown[]) {
        return sql!.prepare(query).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work: () => Promise<void>) {
        sql!.exec("BEGIN");
        try {
          await work();
          sql!.exec("COMMIT");
        } catch (e) {
          sql!.exec("ROLLBACK");
          throw e;
        }
      },
    });
    vi.mocked(readInitializedDatabase).mockResolvedValue(
      database as Awaited<ReturnType<typeof readInitializedDatabase>>,
    );
    vi.mocked(requireActiveUserId).mockImplementation(async () => activeAccount);
    return createTripCoreV2Repository(database, async () => activeAccount, hash);
  }
  const pairs = (rows: { itemId: string; semanticRevision: number }[]) =>
    rows
      .map(({ itemId, semanticRevision }) => ({ itemId, semanticRevision }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId));
  try {
    let repository = open(true);
    let context = await repository.captureContext(tripId);
    const first = await repository.refresh(context, transport);
    const read2Pairs = first.records
      .filter((r) => r.kind === "ITEM")
      .map((r) => ({ itemId: r.id, semanticRevision: r.revision }));
    expect(pairs(read2Pairs)).toEqual(pairs(expected));
    expect(first.manifest.complete).toBe(true);
    expect(first.manifest.readVersion).toBe(2);
    const publicText = JSON.stringify({
      manifest: first.manifest,
      records: first.records,
    });
    for (const id of privateIds) expect(publicText).not.toContain(id);
    expect(publicText).not.toContain("track-c/field-evidence");
    expect(publicText).not.toContain("source-publication/");
    await repository.refresh(context, transport);
    loseCollection = true;
    await expect(repository.refresh(context, transport)).rejects.toThrow();
    // The failed response cannot clear the last complete accepted partition.
    expect(
      sql!
        .prepare(
          "SELECT count(*) AS n FROM trip_core_itinerary_events WHERE cache_account_id=? AND trip_id=?",
        )
        .get(accountId, tripId)?.n,
    ).toBe(expected.length);
    await repository.refresh(context, transport);
    const sqlitePairs = sql!
      .prepare(
        "SELECT id AS itemId,semantic_revision AS semanticRevision FROM trip_core_itinerary_events WHERE cache_account_id=? AND trip_id=? ORDER BY id",
      )
      .all(accountId, tripId) as { itemId: string; semanticRevision: number }[];
    expect(pairs(sqlitePairs)).toEqual(pairs(expected));
    expect(sql!.prepare("SELECT count(*) AS n FROM trip_day_events").get()?.n).toBe(0);
    sql!.close();
    sql = undefined;
    repository = open(false);
    context = await repository.captureContext(tripId);
    offline = true;
    const readsBeforeReopen = collectionReads;
    const observed = (await (await readTripDayFeed()).trip(tripId)).observed!;
    expect(collectionReads).toBe(readsBeforeReopen);
    if (observed.projection.version !== 2) throw new Error("V2_REQUIRED");
    const projection = observed.projection;
    const dayPairs = projection.events.map((event) => ({
      itemId: event.id,
      semanticRevision: event.semantic_revision,
    }));
    expect(pairs(dayPairs)).toEqual(pairs(expected));
    expect(projection.source.epoch).toBe(first.manifest.epoch);
    expect(projection.source.accessRevision).toBe(first.manifest.accessRevision);
    for (const item of expected) {
      const query = projection.query(item.localDate, "UTC");
      expect(
        query.coreRows.map((r) => ({
          itemId: r.itemRef,
          semanticRevision: r.itemRevision,
        })),
      ).toEqual([{ itemId: item.itemId, semanticRevision: item.semanticRevision }]);
      expect(query.coreRows[0].rowKey).toEqual({
        itemId: item.itemId,
        projectionRole: "ORIGIN",
        localDate: item.localDate,
      });
      const event = projection.events.find((e) => e.id === item.itemId)!;
      expect(event.temporal_shape).toBe("TRANSPORT");
      expect(projection.flightFacts[item.itemId].qualification).toBe("QUALIFIED");
      expect(
        event.boundaries.find((b) => b.role === "DESTINATION")?.local_date,
      ).toBeNull();
      expect(
        event.boundaries.every(
          (b) =>
            b.accepted_place_id === null &&
            b.accepted_latitude === null &&
            b.accepted_longitude === null,
        ),
      ).toBe(true);
      const html = renderToStaticMarkup(
        createElement(DayFeed, {
          projection,
          date: item.localDate,
          zone: "UTC",
          services: {},
        }),
      );
      expect(html.match(/data-testid="flight-browse-geometry"/g)).toHaveLength(1);
      expect(html).toContain(projection.flightFacts[item.itemId].flightNumberLiteral);
      expect(html).not.toContain('data-testid="flight-row-3"');
      expect(html).not.toContain("00:00");
    }
    await expect(repository.refresh(context, transport)).rejects.toThrow();
    expect(
      (await (await readTripDayFeed()).trip(tripId)).observed?.projection.events
        .map((e) => e.id)
        .sort(),
    ).toEqual(expected.map((e) => e.itemId).sort());
    offline = false;
    const ownerBundle = await transport.collection(context);
    const wrongTrip = await repository.captureContext(randomUUID());
    await expect(repository.refresh(wrongTrip, transport)).rejects.toMatchObject({
      status: 404,
    });
    activeAccount = otherAccountId;
    const foreignContext = await repository.captureContext(tripId);
    const empty = await repository.refresh(foreignContext, transport);
    expect(empty.records.filter((r) => r.kind === "ITEM")).toEqual([]);
    expect(
      (await (await readTripDayFeed()).trip(tripId)).observed?.projection.events,
    ).toEqual([]);
    await expect(
      repository.install(
        await repository.beginRefresh(foreignContext, empty.manifest.accessRevision),
        ownerBundle.manifest,
        ownerBundle.pages,
      ),
    ).rejects.toThrow();
    activeAccount = accountId;
    expect(
      pairs(
        (await (await readTripDayFeed()).trip(tripId)).observed!.projection.events.map(
          (e) => ({ itemId: e.id, semanticRevision: e.semantic_revision }),
        ),
      ),
    ).toEqual(pairs(expected));
    return {
      classification: "CP_FLIGHT_E2E_AB_JOINED_SQL_SQLITE_DAY",
      accountId,
      tripId,
      sqlRead2SqliteDayPairs: pairs(expected),
      dates: expected.map((i) => i.localDate),
      read2ManifestSha256: first.manifest.manifestSha256,
      read2AccessRevision: first.manifest.accessRevision,
      read2Epoch: first.manifest.epoch,
      lostCollectionResponseRecovered: true,
      fileColdOfflineReopen: true,
      privateSourceLeakage: false,
      sqliteMigration: 54,
    };
  } finally {
    if (sql) sql.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
