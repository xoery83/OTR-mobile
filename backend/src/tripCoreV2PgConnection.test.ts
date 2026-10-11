import { beforeEach, expect, it, vi } from "vitest";
import { createCorePgConnection } from "./tripCoreV2PgConnection";
const f = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  principal: "otr_trip_core_v2_gateway",
  recovery: false,
  destroy: vi.fn(),
  end: vi.fn(),
  queries: [] as string[],
}));
vi.mock("pg", () => ({
  Client: class {
    connection = { stream: { destroy: f.destroy } };
    constructor(config: Record<string, unknown>) {
      f.config = config;
    }
    on() {}
    async connect() {}
    async end() {
      f.end();
    }
    async query(sql: string) {
      f.queries.push(sql);
      return {
        rows: sql.includes("pg_is_in_recovery")
          ? [{ principal: f.principal, role: f.principal, recovery: f.recovery }]
          : [],
      };
    }
  },
}));
const config = {
  host: "db.synthetic.invalid",
  port: 5432,
  database: "postgres",
  password: "synthetic",
};
beforeEach(() => {
  f.principal = "otr_trip_core_v2_gateway";
  f.recovery = false;
  f.destroy.mockClear();
  f.end.mockClear();
  f.queries = [];
});
it("requires a dedicated TLS primary and destroys a finished fresh session", async () => {
  const c = createCorePgConnection(config);
  await c.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_core_v2_gateway");
  expect(f.config.ssl).toMatchObject({ rejectUnauthorized: true });
  expect(f.destroy).toHaveBeenCalled();
});
it("rejects pooled addresses, foreign principals, replicas and unfinished transactions", async () => {
  expect(() => createCorePgConnection({ ...config, port: 6543 })).toThrow();
  expect(() =>
    createCorePgConnection({ ...config, host: "foo.pooler.supabase.com" }),
  ).toThrow();
  for (const identity of [
    { principal: "service_role", recovery: false },
    { principal: "otr_trip_core_v2_gateway", recovery: true },
  ]) {
    Object.assign(f, identity);
    await expect(
      createCorePgConnection(config).withLease(async () => undefined),
    ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  }
  f.recovery = false;
  await expect(
    createCorePgConnection(config).withLease(async (lease) => {
      await lease.query("BEGIN");
    }),
  ).rejects.toThrow("CORE_TRANSACTION_UNFINISHED");
});
