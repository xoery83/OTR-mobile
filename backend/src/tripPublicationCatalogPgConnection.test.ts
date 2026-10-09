import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicationCatalog } from "./tripPublicationCatalogRead";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import fixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
const fake = vi.hoisted(() => ({
  constructions: 0,
  pool: undefined as any,
  checkout: undefined as any,
  query: undefined as any,
}));
vi.mock("pg", () => ({
  Pool: class extends EventEmitter {
    config: unknown;
    client = Object.assign(new EventEmitter(), {
      query: vi.fn((sql: string) => fake.query(sql)),
      release: vi.fn(),
      connection: { stream: { destroy: vi.fn() } },
    });
    constructor(config: unknown) {
      super();
      fake.constructions++;
      this.config = config;
      fake.pool = this;
    }
    connect() {
      return fake.checkout ? fake.checkout(this.client) : Promise.resolve(this.client);
    }
    end() {
      return Promise.resolve();
    }
  },
}));
const config = {
  host: "primary.example.test",
  port: 5432,
  database: "postgres",
  password: "synthetic",
};
let connection: ReturnType<typeof createPublicationCatalogPgConnection>;
const signal = () => new AbortController().signal;
const read = (s = signal()) =>
  readPublicationCatalog(connection, fixture.actor_account_id, fixture.trip_id, s);
const unavailable = {
  status: 503,
  code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
  message: "Publication catalog read is unavailable.",
};
function deferred() {
  let resolve!: (v: any) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<any>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  fake.checkout = undefined;
  fake.query = async (sql: string) => ({
    rows: sql.includes("pg_is_in_recovery")
      ? [{ recovery: false }]
      : sql.includes("session_user")
        ? [{ principal: "otr_trip_source_command_gateway" }]
        : sql.includes("trip_source_read_import_catalogs")
          ? [{ catalog: fixture }]
          : [],
  });
  connection = createPublicationCatalogPgConnection(config);
});
afterEach(async () => {
  await connection.close();
  vi.useRealTimers();
});
describe("dormant PostgreSQL catalog lease", () => {
  it("pins one owner, max1, verified TLS, fixed principal and deadlines", async () => {
    expect(fake.pool.config).toMatchObject({
      max: 1,
      connectionTimeoutMillis: 1000,
      user: "otr_trip_source_command_gateway",
      ssl: { rejectUnauthorized: true },
      options: expect.stringContaining("statement_timeout=5000"),
    });
    expect(() => createPublicationCatalogPgConnection(config)).toThrow();
    await read();
    expect(fake.pool.client.release).toHaveBeenCalledWith();
    expect(fake.pool.client.connection.stream.destroy).not.toHaveBeenCalled();
    expect(fake.pool.client.query.mock.calls.map((row: string[]) => row[0])).toEqual([
      "SELECT pg_is_in_recovery() AS recovery",
      "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY",
      "SET LOCAL statement_timeout = '5000ms'",
      "SET LOCAL lock_timeout = '1000ms'",
      "SELECT session_user AS principal",
      "SELECT public.trip_source_read_import_catalogs($1::uuid,$2::uuid) AS catalog",
      "COMMIT",
    ]);
  });
  it.each([
    { ...config, host: "aws-0.pooler.supabase.com" },
    { ...config, port: 6543 },
    { ...config, user: "service_role" },
    { ...config, ssl: { rejectUnauthorized: false } },
    { ...config, connectionString: "private" },
  ])("rejects pooler and fallback settings", async (invalid) => {
    await connection.close();
    expect(() => createPublicationCatalogPgConnection(invalid)).toThrow();
  });
  it.each([
    "pooler.supabase.com",
    "pooler.supabase.com.",
    "aws-0.pooler.supabase.com",
    "aws-0.pooler.supabase.com.",
    "AWS-0.POOLER.SUPABASE.COM",
    "AWS-0.POOLER.SUPABASE.COM.",
    "AwS-0.PoOlEr.SuPaBaSe.CoM.",
  ])("rejects known Pooler hostname %s before Pool construction", async (host) => {
    await connection.close();
    const constructions = fake.constructions;
    let admitted: ReturnType<typeof createPublicationCatalogPgConnection> | undefined;
    try {
      expect(() => {
        admitted = createPublicationCatalogPgConnection({ ...config, host });
      }).toThrow();
      expect(fake.constructions).toBe(constructions);
    } finally {
      await admitted?.close();
    }
  });
  it.each([
    "db.primary.supabase.co",
    "db.primary.supabase.co.",
    "DB.PrImArY.SUPABASE.CO.",
  ])("admits direct-primary spelling %s without altering TLS identity", async (host) => {
    await connection.close();
    const constructions = fake.constructions;
    connection = createPublicationCatalogPgConnection({ ...config, host });
    expect(fake.constructions).toBe(constructions + 1);
    expect(fake.pool.config).toMatchObject({ host, ssl: { rejectUnauthorized: true } });
    const identity = fake.pool.config.ssl.checkServerIdentity;
    expect(
      identity("ignored", { subjectaltname: "DNS:db.primary.supabase.co" }),
    ).toBeUndefined();
    expect(identity("ignored", { subjectaltname: "DNS:unrelated.test" })).toBeInstanceOf(
      Error,
    );
  });
  it("rejects port6543 before Pool construction", async () => {
    await connection.close();
    const constructions = fake.constructions;
    expect(() =>
      createPublicationCatalogPgConnection({ ...config, port: 6543 }),
    ).toThrow();
    expect(fake.constructions).toBe(constructions);
  });
  it("rejects wrong principal with bounded rollback", async () => {
    const original = fake.query;
    fake.query = (sql: string) =>
      sql.includes("session_user")
        ? Promise.resolve({ rows: [{ principal: "service_role" }] })
        : original(sql);
    await expect(read()).rejects.toMatchObject(unavailable);
    expect(fake.pool.client.query).toHaveBeenLastCalledWith("ROLLBACK", []);
  });
  it("rejects a replica and raw private driver errors", async () => {
    fake.query = () => Promise.resolve({ rows: [{ recovery: true }] });
    await expect(read()).rejects.toMatchObject(unavailable);
    expect(fake.pool.client.release).toHaveBeenCalledWith(true);
    fake.checkout = () => Promise.reject(new Error("postgres://private SQL actor"));
    await expect(read()).rejects.toMatchObject(unavailable);
  });
  it.each([
    "BEGIN",
    "session_user",
    "trip_source_read_import_catalogs",
    "COMMIT",
    "ROLLBACK",
  ])("destroys a timed out %s and ignores its late completion", async (phase) => {
    vi.useFakeTimers();
    const pending = deferred();
    const original = fake.query;
    fake.query = (sql: string) =>
      (phase === "COMMIT" || phase === "ROLLBACK" ? sql === phase : sql.includes(phase))
        ? pending.promise
        : phase === "ROLLBACK" && sql.includes("session_user")
          ? Promise.resolve({ rows: [{ principal: "wrong" }] })
          : original(sql);
    const result = read();
    const rejection = expect(result).rejects.toMatchObject(unavailable);
    await vi.advanceTimersByTimeAsync(phase === "ROLLBACK" ? 1001 : 5001);
    await rejection;
    expect(fake.pool.client.connection.stream.destroy).toHaveBeenCalledTimes(1);
    expect(fake.pool.client.release).toHaveBeenCalledExactlyOnceWith(true);
    pending.resolve({ rows: [] });
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.pool.client.release).toHaveBeenCalledTimes(1);
  });
  it.each(["timeout", "cancel"])(
    "bounds checkout %s and retains busy capacity until late checkout retires",
    async (mode) => {
      vi.useFakeTimers();
      const pending = deferred();
      fake.checkout = () => pending.promise;
      const controller = new AbortController();
      const rejection = expect(read(controller.signal)).rejects.toMatchObject(
        unavailable,
      );
      if (mode === "cancel") controller.abort();
      else await vi.advanceTimersByTimeAsync(1001);
      await rejection;
      await expect(read()).rejects.toMatchObject(unavailable);
      pending.resolve(fake.pool.client);
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.pool.client.release).toHaveBeenCalledExactlyOnceWith(true);
    },
  );
  it("rejects a capacity burst without entering pg's pending queue", async () => {
    const pending = deferred();
    fake.checkout = () => pending.promise;
    const checkout = vi.spyOn(fake.pool, "connect");
    const controller = new AbortController();
    const rejected = expect(read(controller.signal)).rejects.toMatchObject(unavailable);
    await Promise.all(
      Array.from({ length: 100 }, () =>
        expect(read()).rejects.toMatchObject(unavailable),
      ),
    );
    expect(checkout).toHaveBeenCalledTimes(1);
    controller.abort();
    await rejected;
    pending.resolve(fake.pool.client);
    await Promise.resolve();
  });
  it("rejects busy concurrent work immediately and destroys cancellation", async () => {
    const pending = deferred();
    fake.query = () => pending.promise;
    const controller = new AbortController();
    const rejection = expect(read(controller.signal)).rejects.toMatchObject(unavailable);
    await Promise.resolve();
    await expect(read()).rejects.toMatchObject(unavailable);
    controller.abort();
    await rejection;
    expect(fake.pool.client.release).toHaveBeenCalledExactlyOnceWith(true);
    pending.resolve({ rows: [{ recovery: false }] });
  });
  it.each(["BEGIN", "COMMIT", "ROLLBACK"])(
    "retires a lost %s acknowledgment or failed rollback",
    async (phase) => {
      const original = fake.query;
      fake.query = (sql: string) =>
        (phase === "COMMIT" || phase === "ROLLBACK" ? sql === phase : sql.includes(phase))
          ? Promise.reject(new Error("private SQL socket failure"))
          : phase === "ROLLBACK" && sql.includes("session_user")
            ? Promise.resolve({ rows: [{ principal: "wrong" }] })
            : original(sql);
      await expect(read()).rejects.toMatchObject(unavailable);
      expect(fake.pool.client.release).toHaveBeenCalledExactlyOnceWith(true);
    },
  );
  it("rolls back known SQL denials without leaking driver details", async () => {
    const original = fake.query;
    fake.query = (sql: string) =>
      sql.includes("trip_source_read_import_catalogs")
        ? Promise.reject({ code: "42501", message: "FORBIDDEN", detail: "actor-private" })
        : original(sql);
    await expect(read()).rejects.toMatchObject({
      status: 403,
      code: "TRIP_READ_FORBIDDEN",
    });
    expect(fake.pool.client.release).toHaveBeenCalledWith();
  });
  it("rejects arbitrary SQL and retires active work on shutdown", async () => {
    await expect(
      connection.withLease((lease) => lease.query("SET ROLE service_role", []), signal()),
    ).rejects.toMatchObject(unavailable);
    expect(fake.pool.client.query).not.toHaveBeenCalledWith("SET ROLE service_role", []);
    await connection.close();
    await expect(read()).rejects.toMatchObject(unavailable);
  });
});
