import { qualifyCoreTtr } from "../../src/domain/trip/tripCoreTtr";
import { validateCoreReadCollection } from "../../src/domain/trip/tripCoreV2Read";
import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { session } from "./__fixtures__/tripCoreV2Sql";
import {
  ordinaryFixture,
  ordinaryTime,
  ordinaryPlace,
  ordinaryHash,
} from "../../src/domain/trip/__fixtures__/coreOrdinaryOrder";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { createCorePgStorage } from "./tripCoreV2PgStorage";
import { createCorePgReader } from "./tripCoreV2PgRead";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../../src/data/repositories/tripCoreV2Repository";
import { migrations } from "../../src/data/db/migrations";
import { serializeDatabaseTransactions } from "../../src/data/db/databaseConnection";
import {
  withAccountApplyGate,
  beginAccountTransition,
  endAccountTransition,
} from "../../src/data/auth/accountRequestContext";
const fixture = process.env.OTR_CORE_OWNED_SQL_FIXTURE;
it.skipIf(!fixture)(
  "owning SQL ordering/receipts → negotiated read2 → atomic SQLite, cold offline revalidation and private gap",
  async () => {
    const sql = session(fixture!);
    const lease = sql.lease;
    const trip = "10000000-0000-4000-8000-000000000001";
    const folder = mkdtempSync(join(tmpdir(), "otr-core-order-")),
      path = join(folder, "local.sqlite");
    let db: DatabaseSync | undefined;
    try {
      const people = (
        await lease.query(
          "SELECT id::text,user_id::text FROM public.journey_members WHERE trip_id=$1::uuid AND status='linked' AND participation_active ORDER BY user_id",
          [trip],
        )
      ).rows;
      expect(people.length).toBeGreaterThanOrEqual(2);
      const account = String(people[0].user_id),
        author = String(people[1].user_id),
        person = String(people[0].id);
      const f = ordinaryFixture({ accountId: account, tripId: trip, personId: person });
      await lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_ITEM','SET_ORDINARY_ORDER','SET_OBJECT_VISIBILITY','SET_ITEM_SCHEDULE'],enabled_families=ARRAY['P1'],enabled_admission_modes=ARRAY['MANUAL']",
      );
      await lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const connection = {
          withLease: async <T>(work: (x: typeof lease) => Promise<T>) => work(lease),
        },
        storage = createCorePgStorage(connection, ordinaryHash),
        reader = createCorePgReader(connection, ordinaryHash);
      for (const q of f.creates) {
        q.payload = {
          ...q.payload,
          participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
          acl: { visibility: "GROUP", people: [] },
        };
        const result = await executeCoreCommandV2(storage, author, trip, q, ordinaryHash);
        expect(result.projection).toBe("FULL");
        if (result.projection === "FULL") expect(result.receipt.outcome).toBe("APPLIED");
      }
      const first = await executeCoreCommandV2(
        storage,
        account,
        trip,
        f.order,
        ordinaryHash,
      );
      expect(first.projection).toBe("FULL");
      if (first.projection === "FULL") expect(first.receipt.outcome).toBe("APPLIED");
      // Treat the first committed response as lost; exact replay returns the same owning receipt.
      expect(
        await executeCoreCommandV2(storage, account, trip, f.order, ordinaryHash),
      ).toEqual(first);
      const conflict = await executeCoreCommandV2(
        storage,
        account,
        trip,
        { ...f.order, operationId: randomUUID() },
        ordinaryHash,
      );
      if (conflict.projection === "FULL")
        expect(conflict.receipt.outcome).toBe("CONFLICT");
      const wrong = structuredClone(f.order);
      wrong.operationId = randomUUID();
      wrong.payload.personId = String(people[1].id);
      wrong.baseVector = wrong.baseVector.map((v) =>
        v.kind === "ORDER" ? { ...v, revision: 1 } : v,
      );
      const rejected = await executeCoreCommandV2(
        storage,
        account,
        trip,
        wrong,
        ordinaryHash,
      );
      if (rejected.projection === "FULL")
        expect(rejected.receipt.outcome).toBe("REJECTED");
      const bundle = await reader.collection(account, trip, 1);
      expect(bundle.manifest.ordinaryOrderVersion).toBe(1);
      expect((await reader.collection(account, trip)).manifest).not.toHaveProperty(
        "ordinaryOrderVersion",
      );
      let activeAccount = account;
      const open = (initialize: boolean) => {
        db = new DatabaseSync(path);
        if (initialize) for (const m of migrations) db.exec(m.sql);
        const database: CoreDatabase = serializeDatabaseTransactions({
          async getFirstAsync<T>(q: string, ...v: unknown[]) {
            return (db!.prepare(q).get(...(v as never[])) ?? null) as T | null;
          },
          async getAllAsync<T>(q: string, ...v: unknown[]) {
            return db!.prepare(q).all(...(v as never[])) as T[];
          },
          async runAsync(q: string, ...v: unknown[]) {
            return db!.prepare(q).run(...(v as never[])) as never;
          },
          async withTransactionAsync(work: () => Promise<void>) {
            db!.exec("BEGIN");
            try {
              await work();
              db!.exec("COMMIT");
            } catch (e) {
              db!.exec("ROLLBACK");
              throw e;
            }
          },
        });
        return {
          database,
          repo: createTripCoreV2Repository(
            database,
            async () => activeAccount,
            ordinaryHash,
          ),
        };
      };
      let local = open(true),
        ctx = await local.repo.captureContext(trip);
      await local.repo.install(
        await local.repo.beginRefresh(ctx, bundle.manifest.accessRevision),
        bundle.manifest,
        bundle.pages,
      );
      await local.repo.install(
        await local.repo.beginRefresh(ctx, bundle.manifest.accessRevision),
        bundle.manifest,
        bundle.pages,
      );
      expect(
        db!.prepare("SELECT count(*) n FROM trip_core_trip_person_ordinary_orders").get(),
      ).toMatchObject({ n: 1 });
      expect(
        db!.prepare("SELECT count(*) n FROM trip_core_itinerary_events").get(),
      ).toMatchObject({ n: 4 });
      const original = await local.repo.readTtr(ctx, f.orderId, f.ids[0], f.ids[1]);
      expect(original.status).toBe("QUALIFIED");
      for (let i = 0; i < 3; i++)
        expect(
          (await local.repo.readTtr(ctx, f.orderId, f.ids[i], f.ids[i + 1])).status,
        ).toBe("QUALIFIED");
      // A real transaction-owned checker neither nests a transaction nor reacquires the Account gate.
      if (original.status === "QUALIFIED")
        await withAccountApplyGate(() =>
          local.database.withTransactionAsync(async () => {
            expect(
              await local.repo.revalidateTtrWithinTransaction(
                ctx,
                f.orderId,
                f.ids[0],
                f.ids[1],
                original,
              ),
            ).toBe(true);
            const tampered = structuredClone(original);
            tampered.input.from!.endpoint!.coordinates!.latitude = 89;
            expect(
              await local.repo.revalidateTtrWithinTransaction(
                ctx,
                f.orderId,
                f.ids[0],
                f.ids[1],
                tampered,
              ),
            ).toBe(false);
          }),
        );
      db!.close();
      local = open(false);
      ctx = await local.repo.captureContext(trip);
      expect((await local.repo.readTtr(ctx, f.orderId, f.ids[0], f.ids[1])).status).toBe(
        "QUALIFIED",
      );
      const oldCtx = ctx;
      const change = await beginAccountTransition();
      endAccountTransition(change);
      await expect(
        local.repo.readTtr(oldCtx, f.orderId, f.ids[0], f.ids[1]),
      ).rejects.toThrow();
      ctx = await local.repo.captureContext(trip);
      activeAccount = author;
      await expect(
        local.repo.readTtr(ctx, f.orderId, f.ids[0], f.ids[1]),
      ).rejects.toThrow();
      activeAccount = account;
      const hide = f.command(
        "SET_OBJECT_VISIBILITY",
        f.ids[1],
        { acl: { visibility: "PRIVATE", people: [] } },
        [{ kind: "ITEM", id: f.ids[1], revision: 1 }],
      );
      await executeCoreCommandV2(storage, author, trip, hide, ordinaryHash);
      const privateBundle = await reader.collection(account, trip, 1);
      expect(JSON.stringify(privateBundle)).not.toContain(f.ids[1]);
      await local.repo.install(
        await local.repo.beginRefresh(ctx, privateBundle.manifest.accessRevision),
        privateBundle.manifest,
        privateBundle.pages,
      );
      expect((await local.repo.readTtr(ctx, f.orderId, f.ids[0], f.ids[2])).status).toBe(
        "UNAVAILABLE",
      );
      expect((await local.repo.readTtr(ctx, f.orderId, f.ids[2], f.ids[3])).status).toBe(
        "QUALIFIED",
      );
      // A private intermediate makes historical full audit unavailable, not an evidence disclosure.
      expect(
        (await executeCoreCommandV2(storage, account, trip, f.order, ordinaryHash))
          .projection,
      ).toBe("STATUS_ONLY");
      // Personal data is outside Core maintenance; unknown B ENTRY zone cannot erase it.
      db!.exec(
        "CREATE TABLE ttr_selections(account_id TEXT,trip_id TEXT,from_event_id TEXT,to_event_id TEXT,occurrence_discriminator TEXT,confirmed_mode TEXT,selected_at TEXT,applicable_event_date TEXT,expiry_zone_id TEXT)",
      );
      db!
        .prepare("INSERT INTO ttr_selections VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          account,
          trip,
          f.ids[2],
          f.ids[3],
          "retained-selection",
          "walking",
          "2026-10-13T00:00:00Z",
          "2027-01-15",
          "UTC",
        );
      const schedule = f.command(
        "SET_ITEM_SCHEDULE",
        f.ids[3],
        { schedule: { start: { ...ordinaryTime("12"), zone_id: null } } },
        [{ kind: "ITEM", id: f.ids[3], revision: 1 }],
      );
      await executeCoreCommandV2(storage, author, trip, schedule, ordinaryHash);
      const unknownZone = await reader.collection(account, trip, 1);
      await local.repo.install(
        await local.repo.beginRefresh(ctx, unknownZone.manifest.accessRevision),
        unknownZone.manifest,
        unknownZone.pages,
      );
      expect((await local.repo.readTtr(ctx, f.orderId, f.ids[2], f.ids[3])).status).toBe(
        "UNAVAILABLE",
      );
      expect(db!.prepare("SELECT count(*) n FROM ttr_selections").get()).toMatchObject({
        n: 1,
      });
      db!.exec("UPDATE trip_core_scopes SET access_revision=access_revision+1");
      await expect(
        local.repo.readTtr(ctx, f.orderId, f.ids[2], f.ids[3]),
      ).rejects.toThrow("CORE_READ_ACCESS_MISMATCH");
      expect(db!.prepare("SELECT count(*) n FROM ttr_selections").get()).toMatchObject({
        n: 1,
      });
      console.log(
        JSON.stringify({
          classification: "CORE_ORDER_CLOSED_SQL_SQLITE",
          orderId: f.orderId,
          pairs: 3,
          replay: true,
          coldOfflineReopen: true,
          innerChecker: true,
          privateGapRedacted: true,
          sqlite: 57,
        }),
      );
    } finally {
      try {
        await lease.query("RESET SESSION AUTHORIZATION");
        await lease.query(
          "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}'",
        );
      } finally {
        sql.close();
        db?.close();
        rmSync(folder, { recursive: true, force: true });
      }
    }
  },
  30000,
);
it.skipIf(!fixture)(
  "owning accepted Transport arrival and explicit interval coverage remain separate from ordinary ground pairs",
  async () => {
    const sql = session(fixture!),
      lease = sql.lease,
      trip = "10000000-0000-4000-8000-000000000001";
    try {
      const p = (
        await lease.query(
          "SELECT id::text,user_id::text FROM public.journey_members WHERE trip_id=$1::uuid AND status='linked' AND participation_active ORDER BY user_id",
          [trip],
        )
      ).rows[1];
      const account = String(p.user_id),
        person = String(p.id),
        f = ordinaryFixture({ accountId: account, tripId: trip, personId: person });
      await lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_ITEM','SET_ORDINARY_ORDER'],enabled_families=ARRAY['P1','P5'],enabled_admission_modes=ARRAY['MANUAL']",
      );
      await lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const connection = {
          withLease: async <T>(work: (l: typeof lease) => Promise<T>) => work(lease),
        },
        storage = createCorePgStorage(connection, ordinaryHash),
        reader = createCorePgReader(connection, ordinaryHash);
      for (let i = 0; i < f.creates.length; i++) {
        const q = f.creates[i];
        let payload: unknown = {
          ...q.payload,
          schedule: {
            start: {
              ...ordinaryTime(String(9 + i).padStart(2, "0")),
              local_date: "2027-03-21",
            },
          },
          participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
          acl: { visibility: "GROUP", people: [] },
        };
        if (i === 1)
          payload = {
            family: "P5",
            core: { title: "Synthetic physical leg" },
            participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
            acl: { visibility: "GROUP", people: [] },
            endpoints: {
              origin: {
                time: { ...ordinaryTime("09"), local_date: "2027-03-21" },
                place: ordinaryPlace(1),
              },
              destination: {
                time: { ...ordinaryTime("10"), local_date: "2027-03-21" },
                place: ordinaryPlace(8),
              },
            },
            annotations: {
              origin: {
                airport_code: null,
                terminal: "departure",
                platform: null,
                pier: null,
              },
              destination: {
                airport_code: null,
                terminal: "arrival",
                platform: null,
                pier: null,
              },
            },
            service: {
              service_key: "rail.one",
              transport_subtype: "TRAIN",
              attribution: "UNSPECIFIED",
              operator_namespace: "NAME",
              operator_issuer: "SUPPLIER",
              operator_value: "Synthetic Rail",
              operator_literal: "Synthetic Rail",
              service_number: "1",
              service_literal: "Rail 1",
              codeshare_operating_key: null,
            },
          };
        const receipt = await executeCoreCommandV2(
          storage,
          account,
          trip,
          { ...q, payload },
          ordinaryHash,
        );
        expect(receipt.projection).toBe("FULL");
        if (receipt.projection === "FULL")
          expect(receipt.receipt.outcome).toBe("APPLIED");
      }
      f.order.payload.nodes[1].entry = "ORIGIN";
      f.order.payload.nodes[1].exit = "DESTINATION";
      await executeCoreCommandV2(storage, account, trip, f.order, ordinaryHash);
      const bundle = await reader.collection(account, trip, 1),
        validated = await validateCoreReadCollection(
          bundle.manifest,
          bundle.pages,
          account,
          trip,
          ordinaryHash,
        );
      const scope = { accountId: account, tripId: trip, generation: 0 };
      const q = await qualifyCoreTtr(
        validated.graph,
        f.actor,
        f.orderId,
        f.ids[1],
        f.ids[2],
        scope,
        bundle.manifest,
        [person],
        ordinaryHash,
        true,
      );
      expect(q.status).toBe("QUALIFIED");
      if (q.status === "QUALIFIED") {
        expect(q.input.from!.endpoint!.role).toBe("DESTINATION");
        expect(q.input.from!.endpoint!.coordinates!.latitude).toBe(8);
        expect(q.spatial.annotations[0].terminal).toBe("arrival");
      }
      const covered = structuredClone(f.order);
      covered.operationId = randomUUID();
      covered.baseVector = covered.baseVector.map((v) =>
        v.kind === "ORDER" ? { ...v, revision: 1 } : v,
      );
      covered.payload.nodes = covered.payload.nodes.filter((n) => n.eventId !== f.ids[1]);
      covered.payload.gaps = [
        {
          from: f.ids[0],
          to: f.ids[2],
          coverage: "EXPLICIT_TRANSPORT",
          transportId: f.ids[1],
          complete: true,
        },
        {
          from: f.ids[2],
          to: f.ids[3],
          coverage: "NONE_PROVEN",
          transportId: null,
          complete: true,
        },
      ];
      const result = await executeCoreCommandV2(
        storage,
        account,
        trip,
        covered,
        ordinaryHash,
      );
      if (result.projection === "FULL") expect(result.receipt.outcome).toBe("APPLIED");
      const next = await reader.collection(account, trip, 1),
        graph = (
          await validateCoreReadCollection(
            next.manifest,
            next.pages,
            account,
            trip,
            ordinaryHash,
          )
        ).graph;
      expect(
        await qualifyCoreTtr(
          graph,
          f.actor,
          f.orderId,
          f.ids[0],
          f.ids[2],
          scope,
          next.manifest,
          [person],
          ordinaryHash,
          true,
        ),
      ).toMatchObject({ status: "UNAVAILABLE", reason: "EXPLICIT_TRANSPORT" });
      expect(
        (
          await qualifyCoreTtr(
            graph,
            f.actor,
            f.orderId,
            f.ids[2],
            f.ids[3],
            scope,
            next.manifest,
            [person],
            ordinaryHash,
            true,
          )
        ).status,
      ).toBe("QUALIFIED");
    } finally {
      try {
        await lease.query("RESET SESSION AUTHORIZATION");
        await lease.query(
          "UPDATE public.trip_core_activation_gate SET runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}'",
        );
      } finally {
        sql.close();
      }
    }
  },
  30000,
);
