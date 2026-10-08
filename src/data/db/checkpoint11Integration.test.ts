import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { migrations } from "./migrations";
import { runMigrations } from "./migrationRunner";
import { serializeDatabaseTransactions } from "./databaseConnection";
import { createTripCanonicalEventRepository } from "@/data/repositories/tripCanonicalEventRepository";
import { createTripDayReadRepository } from "@/data/repositories/tripDayReadRepository";
import { createLocalCaptureInboxRepository } from "@/data/repositories/localCaptureInboxRepository";
import { fingerprintEventCollection } from "@/data/repositories/tripEventCollectionVerification";
import { canonicalEventFactsSchema } from "@/data/api/tripCanonicalReadContracts";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { createAuthRepository } from "@/data/auth/authSessionRepository";
import { stateFromLocalSession } from "@/domain/auth/localSession";

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_: string, value: string) =>
    createHash("sha256").update(value).digest("hex"),
}));
const account = "10000000-0000-4000-8000-000000000001";
const otherAccount = "10000000-0000-4000-8000-000000000002";
const trip = "20000000-0000-4000-8000-000000000001";
const instant = "2026-12-17T10:00:00.123456Z";

describe("Checkpoint 11 registered composition", () => {
  it.each([0, 46])(
    "opens from SQLite %i, commits both slices and cold reopens offline",
    async (version) => {
      const folder = mkdtempSync(join(tmpdir(), "otr-checkpoint11-"));
      let sql = new DatabaseSync(join(folder, "integrated.db"));
      // Match Expo's default: no dependency on foreign-key cascades.
      sql.exec("PRAGMA foreign_keys=OFF");
      const adapter = () =>
        serializeDatabaseTransactions({
          async execAsync(query: string) {
            sql.exec(query);
          },
          async getFirstAsync<T>(query: string, ...args: unknown[]) {
            return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
          },
          async getAllAsync<T>(query: string, ...args: unknown[]) {
            return sql.prepare(query).all(...(args as never[])) as T[];
          },
          async runAsync(query: string, ...args: unknown[]) {
            const result = sql.prepare(query).run(...(args as never[]));
            return {
              changes: Number(result.changes),
              lastInsertRowId: Number(result.lastInsertRowid),
            };
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
        if (version === 46) {
          sql.exec(
            "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
          );
          for (const migration of migrations.filter(({ id }) => id <= version)) {
            sql.exec(migration.sql);
            sql
              .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
              .run(migration.id, migration.name, "baseline");
          }
          sql.exec(
            "INSERT INTO expenses(id,trip_id,title,amount_minor,currency_code,created_at,updated_at,sync_status) VALUES('legacy','trip','Retained',123,'USD','baseline','baseline','SYNCED')",
          );
        }
        const prior = version
          ? sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()
          : [];
        let db = adapter();
        await runMigrations(db);
        if (version)
          expect(
            sql
              .prepare("SELECT title,amount_minor FROM expenses WHERE id='legacy'")
              .get(),
          ).toEqual({ title: "Retained", amount_minor: 123 });
        expect(
          sql
            .prepare("SELECT * FROM schema_migrations WHERE id<=46 ORDER BY id")
            .all()
            .slice(0, prior.length),
        ).toEqual(prior);
        expect(
          sql
            .prepare("SELECT id,name FROM schema_migrations WHERE id>=47 ORDER BY id")
            .all(),
        ).toEqual([
          { id: 47, name: "trip_day_read_model" },
          { id: 48, name: "local_capture_inbox" },
          { id: 49, name: "trip_import_flight_admission" },
          { id: 50, name: "intelligence_continuations" },
          { id: 51, name: "capture_submissions" },
        ]);
        expect(
          sql
            .prepare("SELECT id FROM schema_migrations ORDER BY id")
            .all()
            .map((r) => r.id),
        ).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
        expect(sql.prepare("PRAGMA synchronous").get()).toMatchObject({ synchronous: 2 });
        const storage = new Map<string, string>();
        const auth = createAuthRepository({
          getItem: async (key) => storage.get(key) ?? null,
          setItem: async (key, value) => {
            storage.set(key, value);
          },
          deleteItem: async (key) => {
            storage.delete(key);
          },
        });
        const session = (userId: string) => ({
          accessToken: "expired",
          refreshToken: null,
          expiresAt: "2000-01-01T00:00:00Z",
          identity: { userId, displayName: "Offline", email: null },
        });
        await auth.writeLocalSession(session(account));
        const getUser = async () => (await auth.readLocalSession())!.identity!.userId;
        expect(stateFromLocalSession(await auth.readLocalSession())).toBe(
          "AUTHENTICATED_OFFLINE",
        );
        sql
          .prepare(
            "INSERT INTO ledger_actor_context(user_id,journey_id,capabilities_json,updated_at) VALUES(?,?,'{}','baseline')",
          )
          .run(account, trip);
        const event = canonicalEventFactsSchema.parse({
          ...Object.fromEntries(
            Object.keys(canonicalEventFactsSchema.shape).map((key) => [key, null]),
          ),
          id: "30000000-0000-4000-8000-000000000001",
          trip_id: trip,
          temporal_contract_version: 1,
          temporal_shape: "POINT",
          semantic_revision: 1,
          title: "Certified",
          event_type: "activity",
          status: "planned",
          participant_scope: "UNASSIGNED",
          is_estimated_time: false,
          itinerary_transport_endpoints: [],
          planned_start: instant,
          start_quality: "EXACT",
          start_basis: "SOURCE_INSTANT",
          start_source_instant: instant,
          start_source_instant_precision: 6,
          start_provenance_refs: {},
        });
        const reads = [
          {
            readVersion: 1 as const,
            disposition: "READ_ONLY" as const,
            legacyCompatible: false as const,
            event,
          },
        ];
        const fingerprint = await fingerprintEventCollection(trip, reads);
        const canonical = createTripCanonicalEventRepository(
          db,
          getUser,
          undefined,
          async (context) => ({
            collectionContractVersion: 1,
            readVersion: 1,
            temporalContractVersion: 1,
            fingerprintVersion: 1,
            ordering: "EVENT_ID_ASC",
            disposition: "SNAPSHOT_PAGE",
            accountId: context.accountId,
            tripId: trip,
            snapshot: {
              epochId: "40000000-0000-4000-8000-000000000001",
              collectionRevision: "1",
            },
            eventCount: 1,
            fingerprint,
            startOrdinal: 0,
            endOrdinal: 1,
            events: reads,
            complete: true,
            nextCursor: null,
          }),
        );
        await canonical.refreshCollection(trip);
        const captureDependencies = {
          newId: randomUUID,
          now: () => "2026-10-05T00:00:00.000Z",
          sha256: async (bytes: Uint8Array) =>
            createHash("sha256").update(bytes).digest("hex"),
        };
        let day = createTripDayReadRepository(db, getUser);
        let inbox = createLocalCaptureInboxRepository(db, getUser, captureDependencies);
        const [, captured] = await Promise.all([
          day.rebuild(trip),
          inbox.intake({ kind: "TEXT", tripId: trip }, { text: "Immutable capture" }),
        ]);
        await Promise.all([day.rebuild(trip), inbox.assign(captured.id, null, 1)]);
        const pendingDay = await day.prepare(trip);
        for (const userId of [otherAccount, account]) {
          const lease = await beginAccountTransition();
          await auth.writeLocalSession(session(userId));
          endAccountTransition(lease);
          if (userId === otherAccount) {
            expect(await day.getProjection(trip)).toBeNull();
            expect(await inbox.listInbox()).toEqual([]);
          }
        }
        await expect(pendingDay!.install()).rejects.toThrow("Account changed");
        const migrationsBefore = sql
          .prepare("SELECT * FROM schema_migrations ORDER BY id")
          .all();
        sql.close();
        sql = new DatabaseSync(join(folder, "integrated.db"));
        sql.exec("PRAGMA foreign_keys=OFF");
        db = adapter();
        await runMigrations(db);
        day = createTripDayReadRepository(db, getUser);
        inbox = createLocalCaptureInboxRepository(db, getUser, captureDependencies);
        expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
          migrationsBefore,
        );
        expect((await day.today(trip, instant, "UTC"))?.result.timed[0].anchor).toBe(
          instant,
        );
        expect((await day.getProjection(trip))?.sourceStatus).toBe(
          "CURRENTLY_MATCHES_SOURCE",
        );
        const retained = await inbox.getForSourceHandoff(captured.id);
        expect(new TextDecoder().decode(retained.bytes)).toBe("Immutable capture");
        expect(retained.capture).toMatchObject({
          state: "INBOX",
          tripId: null,
          revision: 2,
        });
        await inbox.deleteCapture(captured.id, 2);
        expect((await day.getProjection(trip))?.projection.generation).toBe(2);
        expect(sql.prepare("PRAGMA integrity_check").get()).toEqual({
          integrity_check: "ok",
        });
        expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        sql.close();
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
