import type { SQLiteDatabase } from "expo-sqlite";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  createTtrSelectionRepository,
  type TtrSelectionClock,
  type TtrSelectionRelation,
} from "./ttrSelectionRepository";
import {
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";

const filename = "otr-ttr-native-lab-cp05a2-v1.db";
const schema = `CREATE TABLE ttr_selections (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
 from_event_id TEXT NOT NULL, to_event_id TEXT NOT NULL,
 occurrence_discriminator TEXT NOT NULL CHECK(json_valid(occurrence_discriminator)),
 confirmed_mode TEXT NOT NULL CHECK(confirmed_mode IN ('walking','driving','transit')),
 selected_at TEXT NOT NULL, applicable_event_date TEXT, expiry_zone_id TEXT,
 CHECK((applicable_event_date IS NULL)=(expiry_zone_id IS NULL)),
 PRIMARY KEY(account_id,trip_id,from_event_id,to_event_id,occurrence_discriminator)
);`;
type Database = Pick<
  SQLiteDatabase,
  | "getFirstAsync"
  | "getAllAsync"
  | "runAsync"
  | "execAsync"
  | "withTransactionAsync"
  | "closeAsync"
>;
type Options = {
  source: "SYNTHETIC_TTR_LAB";
  authorized(): boolean;
  context(): AccountRequestContext;
  clock(): TtrSelectionClock;
  isCurrentRelation(
    context: AccountRequestContext,
    relation: TtrSelectionRelation,
  ): Promise<boolean>;
};
type Driver = {
  openDatabaseAsync(name: string, options: { useNewConnection: true }): Promise<Database>;
};
let inUse = false;
const normalize = (sql: string) => sql.trim().replace(/;$/, "");
function guard(options: Options) {
  if (
    typeof __DEV__ === "undefined" ||
    __DEV__ !== true ||
    options.source !== "SYNTHETIC_TTR_LAB" ||
    options.authorized() !== true
  )
    throw new Error("TTR_LAB_NOT_AUTHORIZED");
  const context = { ...options.context() };
  if (
    context.accountId !== "10000000-0000-4000-8000-000000000001" ||
    !/^20000000-0000-4000-8000-0000000000(?:0[1-9]|1[0-6]|99)$/.test(context.tripId)
  )
    throw new Error("TTR_LAB_NON_FIXTURE_SCOPE");
  assertAccountRequestGeneration(context);
  return context;
}

/** Explicit DEV fixture opener only. Never registered in application startup. */
export async function openTtrLabSelectionRepository(
  options: Options,
  load: () => Promise<Driver> = async () => import("expo-sqlite"),
) {
  guard(options);
  if (inUse) throw new Error("TTR_LAB_ALREADY_OPEN");
  inUse = true;
  let database: Database | undefined;
  try {
    const driver = await load();
    guard(options);
    database = serializeDatabaseTransactions(
      await driver.openDatabaseAsync(filename, { useNewConnection: true }),
    );
    guard(options);
    const db = database;
    await db.withTransactionAsync(async () => {
      const entities = await db.getAllAsync<{ name: string; type: string; sql: string }>(
        "SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
      );
      if (entities.length === 0) await db.execAsync(schema);
      else if (
        entities.length !== 1 ||
        entities[0].name !== "ttr_selections" ||
        entities[0].type !== "table" ||
        normalize(entities[0].sql) !== normalize(schema)
      )
        throw new Error("TTR_LAB_SCHEMA_MISMATCH");
      const columns = await db.getAllAsync<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: unknown;
      }>("PRAGMA table_info(ttr_selections)");
      const names = [
        "account_id",
        "trip_id",
        "from_event_id",
        "to_event_id",
        "occurrence_discriminator",
        "confirmed_mode",
        "selected_at",
        "applicable_event_date",
        "expiry_zone_id",
      ];
      if (
        columns.length !== 9 ||
        columns.some(
          (c, i) =>
            c.name !== names[i] ||
            c.type !== "TEXT" ||
            c.notnull !== (i < 7 ? 1 : 0) ||
            c.pk !== (i < 5 ? i + 1 : 0) ||
            c.dflt_value !== null,
        )
      )
        throw new Error("TTR_LAB_SCHEMA_MISMATCH");
      guard(options);
    });
    const repository = createTtrSelectionRepository(
      db,
      async () => guard(options).accountId,
      {
        clock: options.clock,
        isCurrentRelation: async (ctx, relation) => {
          guard(options);
          return options.isCurrentRelation(ctx, relation);
        },
      },
    );
    let closing = false,
      closed = false,
      closePromise: Promise<void> | null = null;
    const pending = new Set<Promise<unknown>>();
    function lease<T>(work: () => Promise<T>): Promise<T> {
      if (closing || closed) return Promise.reject(new Error("TTR_LAB_CLOSED"));
      try {
        guard(options);
      } catch (e) {
        return Promise.reject(e);
      }
      const request = work();
      pending.add(request);
      void request.finally(() => pending.delete(request)).catch(() => {});
      return request;
    }
    return {
      repository: {
        read: (...args: Parameters<typeof repository.read>) =>
          lease(() => repository.read(...args)),
        confirm: (...args: Parameters<typeof repository.confirm>) =>
          lease(() => repository.confirm(...args)),
        reconcileExpiry: (...args: Parameters<typeof repository.reconcileExpiry>) =>
          lease(() => repository.reconcileExpiry(...args)),
        cleanupExpired: (...args: Parameters<typeof repository.cleanupExpired>) =>
          lease(() => repository.cleanupExpired(...args)),
      },
      close(): Promise<void> {
        if (closed) return Promise.resolve();
        if (closePromise) return closePromise;
        closing = true;
        closePromise = (async () => {
          await Promise.allSettled([...pending]);
          await db.closeAsync();
          closed = true;
          inUse = false;
        })();
        void closePromise.catch(() => {
          closePromise = null;
        });
        return closePromise;
      },
    };
  } catch (error) {
    // A failed close keeps the singleton lease fenced; never open another live connection.
    if (database) await database.closeAsync();
    inUse = false;
    throw error;
  }
}
