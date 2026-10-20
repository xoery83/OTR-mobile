import { expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { readTripSearchRepository } from "./tripSearchRepository";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreLifecycleGraphHash } from "@/domain/trip/tripCoreV2Lifecycle";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
it("normal SQLite search is incremental across whole Trip, formal certificates/cold/admission/deletion/revoke/ABA fence results and detail", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-search-owned-")),
    path = join(folder, "owned.sqlite");
  let sql = new DatabaseSync(path),
    active = randomUUID();
  const accountId = active,
    tripId = randomUUID(),
    actor = {
      accountId,
      tripId,
      active: true,
      canManageShared: false,
      personId: null,
      personIds: [],
    };
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
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
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) sql.exec(migration.sql);
    vi.mocked(requireActiveUserId).mockImplementation(async () => active);
    vi.mocked(readInitializedDatabase).mockResolvedValue(database as never);
    const core = createTripCoreV2Repository(database, async () => active, hash),
      trips = createTripRepository(database, async () => active, core);
    await trips.createTrip({
      operationId: randomUUID(),
      tripId,
      name: "Search contract Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-28",
    });
    const reader = await readTripSearchRepository(),
      input = { query: "Activity", tripId, category: "ITINERARY" as const };
    expect((await reader.page(input)).results).toHaveLength(0); // Pending intents are never accepted Items.
    expect(
      (await reader.page({ query: "Search contract", tripId: null, category: "TRIPS" }))
        .results[0].category,
    ).toBe("TRIPS");
    let graph = emptyCoreGraph();
    const ids: string[] = [];
    const add = (title: string, owner = actor, timed = false, description?: string) => {
      const id = randomUUID();
      ids.push(id);
      graph = applyCoreCommand(
        graph,
        {
          contractVersion: 2,
          intentVersion: 2,
          operationId: randomUUID(),
          tripId,
          command: "CREATE_ITEM",
          target: { kind: "ITEM", id },
          baseVector: [{ kind: "ITEM", id, revision: null }],
          admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
          payload: {
            family: "P1",
            core: { title, ...(description ? { description } : {}) },
            schedule: {
              start: timed
                ? { ...coreDateBoundary("2027-01-27"), zone_id: "Pacific/Auckland" }
                : coreDateBoundary("2027-01-27"),
            },
            ...coreDefaults("member"),
          },
        },
        owner,
        "2027-01-01T00:00:00Z",
      ).graph;
      return id;
    };
    for (let i = 0; i < 105; i++) add(`Activity ${i}`);
    const opener = add("Activity exact opener", actor, true, "Bring an umbrella"),
      foreignId = add(
        "PRIVATE ReferenceSecrets Activity",
        {
          ...actor,
          accountId: randomUUID(),
        },
        false,
        "Bring an umbrella FOREIGN_NOTE_SECRET",
      );
    let revision = 0;
    const epoch = randomUUID();
    const install = async () => {
      const bundle = await buildCoreActorCollection(
          graph,
          actor,
          {
            epoch,
            revision: ++revision,
            accessRevision: 1,
            generatedAt: "2027-01-01T00:00:00Z",
          },
          [],
          hash,
        ),
        context = await core.captureContext(tripId);
      await core.install(
        await core.beginRefresh(context, 1),
        bundle.manifest,
        bundle.pages,
      );
    };
    await install();
    sql.close();
    sql = new DatabaseSync(path);
    sql.exec("PRAGMA foreign_keys=ON");
    const all = async (query: string) => {
      let page = await reader.page({ ...input, query });
      const results = [...page.results];
      for (let i = 0; page.cursor; i++) {
        if (i > 10) throw new Error("TEST_PAGINATION_STALLED");
        page = await reader.page({ ...input, query }, page.cursor);
        results.push(...page.results);
      }
      return { ...page, results };
    };
    const first = await reader.page(input);
    expect(first.results).toHaveLength(100);
    expect(first.cursor).not.toBeNull();
    const second = await reader.page(input, first.cursor);
    expect(second.results).toHaveLength(6);
    expect(second.cursor).toBeNull();
    expect(new Set([...first.results, ...second.results].map((r) => r.id)).size).toBe(
      106,
    );
    expect(
      (await reader.page({ ...input, query: "ReferenceSecrets" })).results,
    ).toHaveLength(0);
    expect([...first.results, ...second.results].some((r) => r.id === foreignId)).toBe(
      false,
    );
    expect((await all("umbrella")).results).toHaveLength(1);
    expect((await all("FOREIGN_NOTE_SECRET")).results).toHaveLength(0);
    const openedPage = await all("Activity exact opener"),
      result = openedPage.results[0],
      proof = openedPage.proofs[0];
    expect((await reader.resolve(result, proof))?.kind).toBe("ITEM");
    await expect(
      reader.page({ ...input, tripId: randomUUID() }, first.cursor),
    ).rejects.toThrow("SEARCH_CURSOR_SCOPE");
    add("Newly admitted Activity");
    await install();
    expect(await reader.validate(first.proofs, first)).toBe(false);
    await expect(reader.page(input, first.cursor)).rejects.toThrow("SEARCH_STALE");
    expect(await reader.resolve(result, proof)).toBeNull();
    expect((await all("Newly admitted")).results).toHaveLength(1);
    const hide = validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "HIDE_OBJECT",
      target: { kind: "ITEM", id: opener },
      baseVector: [{ kind: "ITEM", id: opener, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        scope: "OBJECT_ONLY",
        affectedIds: [{ kind: "ITEM", id: opener }],
        graphHash: "0".repeat(64),
      },
    });
    const closureHash = await coreLifecycleGraphHash(graph, actor, hide, hash);
    graph = applyCoreCommand(
      graph,
      { ...hide, payload: { ...(hide.payload as object), graphHash: closureHash } },
      actor,
      "2027-01-01T00:00:00Z",
      false,
      closureHash,
    ).graph;
    await install();
    expect((await all("Activity exact opener")).results).toHaveLength(0);
    const stable = await reader.page(input);
    active = randomUUID();
    advanceAccountGeneration();
    expect((await reader.page({ ...input, tripId: null })).results).toHaveLength(0);
    await expect(reader.validate(stable.proofs, stable)).rejects.toThrow(
      "Account changed",
    );
    active = accountId;
    advanceAccountGeneration();
    await expect(reader.page(input, stable.cursor)).rejects.toThrow("Account changed");
    expect((await reader.page(input)).results).not.toHaveLength(0);
    const currentPage = await reader.page(input);
    await core.revoke(await core.captureContext(tripId), 2);
    expect((await reader.page(input)).results).toHaveLength(0);
    expect(
      await reader.resolve(currentPage.results[0], currentPage.proofs[0]),
    ).toBeNull();
    await expect(reader.resolve(result, proof)).rejects.toThrow("Account changed");
    // Years of pending/local Trip metadata use bounded pages without claiming
    // that any pending Item has an accepted certificate.
    for (let index = 0; index < 21; index++)
      await trips.createTrip({
        operationId: randomUUID(),
        tripId: randomUUID(),
        name: `IndexTrip ${index}`,
      });
    const tripInput = { query: "IndexTrip", tripId: null, category: "TRIPS" as const };
    const tripFirst = await reader.page(tripInput);
    expect(tripFirst.results.length).toBeGreaterThan(0);
    expect(tripFirst.results.length).toBeLessThanOrEqual(10);
    expect(tripFirst.results.every((r) => r.category === "TRIPS")).toBe(true);
    const tripSecond = await reader.page(tripInput, tripFirst.cursor);
    const tripThird = await reader.page(tripInput, tripSecond.cursor);
    expect(tripSecond.results.length).toBeLessThanOrEqual(10);
    expect(tripThird.results.length).toBeLessThanOrEqual(10);
    expect(tripThird.cursor).toBeNull();
    expect(
      new Set(
        [...tripFirst.results, ...tripSecond.results, ...tripThird.results].map(
          (r) => r.id,
        ),
      ).size,
    ).toBe(21);
    await trips.createTrip({
      operationId: randomUUID(),
      tripId: randomUUID(),
      name: "IndexTrip newly created",
    });
    expect(await reader.validate(tripFirst.proofs, tripFirst)).toBe(false);
  } finally {
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
