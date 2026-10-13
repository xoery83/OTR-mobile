import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openTtrLabSelectionRepository } from "./ttrLabSelectionRepository";
import { getAccountGeneration } from "../auth/accountGeneration";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";

const disposals: (() => Promise<unknown>)[] = [];
beforeEach(() => vi.stubGlobal("__DEV__", true));
afterEach(async () => {
  while (disposals.length) await disposals.pop()!();
  vi.unstubAllGlobals();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "otr-ttr-lab-factory-"));
  let sql: DatabaseSync | null = null,
    authorized = true,
    closeFailures = 0;
  let hold: (() => Promise<void>) | undefined;
  const input = ttrFixture();
  input.scope.generation = getAccountGeneration();
  input.expiry = { eventDate: "2027-01-15", zone: "UTC" };
  const context = {
    accountId: input.scope.accountId,
    tripId: input.scope.tripId,
    generation: input.scope.generation,
  };
  const relation = { input, accessRevision: 1, publicationVersion: 0 };
  const options = {
    source: "SYNTHETIC_TTR_LAB" as const,
    authorized: () => authorized,
    context: () => context,
    clock: () => ({ instant: "2027-01-14T12:00:00Z", certain: true }),
    isCurrentRelation: async () => true,
  };
  const close = vi.fn(async () => {
    if (closeFailures-- > 0) throw new Error("CLOSE_FAILED");
    sql!.close();
    sql = null;
  });
  const driver = {
    openDatabaseAsync: vi.fn(
      async (filename: string, _options: { useNewConnection: true }) => {
        sql = new DatabaseSync(join(dir, filename));
        return {
          async getFirstAsync<T>(q: string, ...args: unknown[]) {
            return (sql!.prepare(q).get(...(args as never[])) ?? null) as T | null;
          },
          async getAllAsync<T>(q: string, ...args: unknown[]) {
            return sql!.prepare(q).all(...(args as never[])) as T[];
          },
          async runAsync(q: string, ...args: unknown[]) {
            return sql!.prepare(q).run(...(args as never[])) as never;
          },
          async execAsync(q: string) {
            sql!.exec(q);
          },
          async withTransactionAsync(work: () => Promise<void>) {
            sql!.exec("BEGIN");
            try {
              await work();
              await hold?.();
              sql!.exec("COMMIT");
            } catch (e) {
              sql!.exec("ROLLBACK");
              throw e;
            }
          },
          closeAsync: close,
        };
      },
    ),
  };
  const load = vi.fn(async () => driver);
  const handles: Awaited<ReturnType<typeof openTtrLabSelectionRepository>>[] = [];
  const open = async () => {
    const h = await openTtrLabSelectionRepository(options, load);
    handles.push(h);
    return h;
  };
  const path = join(dir, "otr-ttr-native-lab-cp05a2-v1.db");
  disposals.push(async () => {
    for (const h of handles) await h.close();
    if (sql) {
      sql.close();
      sql = null;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    options,
    context,
    relation,
    open,
    load,
    driver,
    close,
    path,
    raw: () => sql!,
    unauthorized: () => {
      authorized = false;
    },
    closeFailure: () => {
      closeFailures = 1;
    },
    hold: () => {
      const entered = deferred(),
        release = deferred();
      hold = async () => {
        entered.resolve();
        await release.promise;
      };
      return { entered, release };
    },
  };
}
it.each([false, undefined, "true"])(
  "DEV=%s rejects before loading/opening any database",
  async (dev) => {
    const f = fixture();
    vi.stubGlobal("__DEV__", dev);
    await expect(f.open()).rejects.toThrow("NOT_AUTHORIZED");
    expect(f.load).not.toHaveBeenCalled();
  },
);
it("requires explicit synthetic authorization and rejects real Account/Trip scopes", async () => {
  const f = fixture();
  f.unauthorized();
  await expect(f.open()).rejects.toThrow("NOT_AUTHORIZED");
  expect(f.load).not.toHaveBeenCalled();
  const g = fixture();
  g.context.accountId = "90000000-0000-4000-8000-000000000001";
  await expect(g.open()).rejects.toThrow("NON_FIXTURE_SCOPE");
  expect(g.load).not.toHaveBeenCalled();
  const h = fixture();
  h.context.tripId = "90000000-0000-4000-8000-000000000001";
  await expect(h.open()).rejects.toThrow("NON_FIXTURE_SCOPE");
  expect(h.load).not.toHaveBeenCalled();
});
it("accepts only the two appended 0 m Lab scopes beyond the original fixture range", async () => {
  for (const suffix of ["15", "16"]) {
    const f = fixture();
    f.context.tripId = `20000000-0000-4000-8000-0000000000${suffix}`;
    const handle = await f.open();
    expect(f.driver.openDatabaseAsync).toHaveBeenCalledOnce();
    await handle.close();
  }
  const outside = fixture();
  outside.context.tripId = "20000000-0000-4000-8000-000000000017";
  await expect(outside.open()).rejects.toThrow("NON_FIXTURE_SCOPE");
  expect(outside.load).not.toHaveBeenCalled();
});
it("rechecks DEV authorization after lazy loading before native open", async () => {
  const f = fixture();
  f.load.mockImplementationOnce(async () => {
    vi.stubGlobal("__DEV__", false);
    return f.driver;
  });
  await expect(f.open()).rejects.toThrow("NOT_AUTHORIZED");
  expect(f.driver.openDatabaseAsync).not.toHaveBeenCalled();
});
it("opens only a fixed file/new connection and validates exact accepted schema", async () => {
  const f = fixture();
  await f.open();
  expect(f.driver.openDatabaseAsync).toHaveBeenCalledWith(
    "otr-ttr-native-lab-cp05a2-v1.db",
    { useNewConnection: true },
  );
  const columns = f.raw().prepare("PRAGMA table_info(ttr_selections)").all();
  expect(columns).toHaveLength(9);
  expect(columns.map((c) => c.pk)).toEqual([1, 2, 3, 4, 5, 0, 0, 0, 0]);
  const accepted = readFileSync(
    new URL("./ttrSelectionRepository.test.ts", import.meta.url),
    "utf8",
  )
    .match(/const schema = `([\s\S]*?)`;/)![1]
    .replace(/\s+/g, "")
    .replace(/;$/, "");
  expect(
    String(
      f.raw().prepare("SELECT sql FROM sqlite_master WHERE name='ttr_selections'").get()!
        .sql,
    ).replace(/\s+/g, ""),
  ).toBe(accepted);
  expect(f.raw().prepare("PRAGMA foreign_key_list(ttr_selections)").all()).toEqual([]);
});
it("persists exact Confirm through injected SQLite file close/reopen", async () => {
  const f = fixture();
  const a = await f.open();
  const saved = await a.repository.confirm(f.context, f.relation, "walking");
  await a.close();
  const b = await f.open();
  expect(await b.repository.read(f.context, f.relation)).toEqual(saved);
  expect(f.driver.openDatabaseAsync).toHaveBeenCalledTimes(2);
});
it.each([
  "wrong-column",
  "wrong-constraints",
  "extra-table",
  "trigger",
  "quoted-constraint",
] as const)("schema %s fails closed with existing data preserved", async (kind) => {
  const f = fixture();
  const a = await f.open();
  await a.repository.confirm(f.context, f.relation, "walking");
  await a.close();
  const raw = new DatabaseSync(f.path);
  if (kind === "wrong-column")
    raw.exec("ALTER TABLE ttr_selections ADD COLUMN unexpected TEXT");
  if (kind === "wrong-constraints") {
    raw.exec(
      "ALTER TABLE ttr_selections RENAME TO old; CREATE TABLE ttr_selections AS SELECT * FROM old; DROP TABLE old;",
    );
  }
  if (kind === "extra-table")
    raw.exec(
      "CREATE TABLE canonical_trip(id TEXT); INSERT INTO canonical_trip VALUES('untouched')",
    );
  if (kind === "quoted-constraint") {
    const ddl = String(
      raw.prepare("SELECT sql FROM sqlite_master WHERE name='ttr_selections'").get()!.sql,
    ).replace("'transit'", "'tran sit'");
    raw.exec("ALTER TABLE ttr_selections RENAME TO old;");
    raw.exec(ddl);
    raw.exec("INSERT INTO ttr_selections SELECT * FROM old; DROP TABLE old;");
  }
  if (kind === "trigger")
    raw.exec(
      "CREATE TRIGGER unexpected AFTER UPDATE ON ttr_selections BEGIN SELECT 1; END",
    );
  raw.close();
  await expect(f.open()).rejects.toThrow("SCHEMA_MISMATCH");
  const check = new DatabaseSync(f.path);
  expect(
    check.prepare("SELECT confirmed_mode FROM ttr_selections").get()!.confirmed_mode,
  ).toBe("walking");
  check.close();
});
it("serializes operations, drains pending Confirm before close, rejects new leases and reopens", async () => {
  const f = fixture();
  const a = await f.open();
  const hold = f.hold();
  const saved = a.repository.confirm(f.context, f.relation, "transit");
  await hold.entered.promise;
  const closing = a.close();
  expect(f.close).not.toHaveBeenCalled();
  await expect(a.repository.read(f.context, f.relation)).rejects.toThrow("CLOSED");
  hold.release.resolve();
  await saved;
  await closing;
  expect(f.close).toHaveBeenCalledTimes(1);
  const b = await f.open();
  expect((await b.repository.read(f.context, f.relation))!.mode).toBe("transit");
});
it("refuses multiple live factories and allows explicit retry of close failure", async () => {
  const f = fixture();
  const a = await f.open();
  await expect(f.open()).rejects.toThrow("ALREADY_OPEN");
  f.closeFailure();
  await expect(a.close()).rejects.toThrow("CLOSE_FAILED");
  await expect(f.open()).rejects.toThrow("ALREADY_OPEN");
  await a.close();
  await f.open();
});
it("revoked authorization prevents new repository writes without deleting rows", async () => {
  const f = fixture();
  const a = await f.open();
  await a.repository.confirm(f.context, f.relation, "walking");
  f.unauthorized();
  await expect(a.repository.confirm(f.context, f.relation, "driving")).rejects.toThrow(
    "NOT_AUTHORIZED",
  );
  expect(
    f.raw().prepare("SELECT confirmed_mode FROM ttr_selections").get()!.confirmed_mode,
  ).toBe("walking");
});
it("exports no automatic initializer, application DB or Provider/Sync access", () => {
  const source = readFileSync(
    new URL("./ttrLabSelectionRepository.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(
    /otr-mobile\.db|runMigrations|readInitializedDatabase|supabase|\/sync\/|fetch\(|MapKit/,
  );
  expect(source).toContain('async () => import("expo-sqlite")');
});
