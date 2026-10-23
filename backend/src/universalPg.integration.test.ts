// Real owning connector state machine + actual PG17 synthetic SQL receipt rows.
// Driver I/O is simulated here; actual PG authorization is separately exercised by acceptance scripts.
import { beforeEach, expect, it, vi } from "vitest";
import sqlReceipt from "./__fixtures__/universalTaskSqlReceipt.json";
import { createModelTaskPgConnection } from "./tripCoreV2PgConnection";
import { universalPgTransaction } from "./universalPg";
import { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import { createUniversalPersistenceHost } from "./universalPersistenceHost";
import type { Attempt, Task } from "../../src/domain/intelligence/persistence";
import type { UniversalResult } from "./universalImport";
const f = vi.hoisted(() => ({
  queries: [] as string[],
  receipt: null as unknown,
  scope: null as unknown,
  error: false,
}));
vi.mock("pg", () => ({
  Client: class {
    connection = { stream: { destroy() {} } };
    on() {}
    async connect() {}
    async end() {}
    async query(sql: string) {
      f.queries.push(sql);
      if (sql.includes("pg_is_in_recovery"))
        return {
          rows: [
            {
              principal: "otr_external_integration_call_gateway",
              role: "otr_external_integration_call_gateway",
              recovery: false,
            },
          ],
        };
      if (sql.includes("universal_import_read_scope")) {
        if (f.error) throw Error("CP14_ADMISSION_CLOSED");
        return { rows: [{ scope: f.scope }] };
      }
      if (sql.includes("model_task_read_universal_receipt"))
        return { rows: [{ receipt: f.receipt }] };
      return { rows: [{ value: { status: "synthetic" } }] };
    }
  },
}));
const config = {
  host: "db.synthetic.invalid",
  port: 5432,
  database: "postgres",
  password: "synthetic-not-a-credential",
};
function identities() {
  const c = sqlReceipt.call,
    q = sqlReceipt.admission.request_snapshot;
  const a = {
    ...c,
    config_version: String(c.config_version),
    usage_correlation_id: c.call_id,
    request_material_reference: q.input.reference,
    request_material_sha256: q.input.sha256,
    task_publication_fence: c.publication_fence,
    cancellation_disposition: "NONE",
  } as unknown as Attempt;
  const task = {
    account_id: c.account_id,
    task_id: c.task_id,
    trip_id: c.trip_id,
    import_id: c.import_id,
    publication_fence: c.publication_fence,
    input_sha256: c.input_sha256,
    logical_request_id: q.logical_request_id,
    logical_idempotency_key: q.logical_idempotency_key,
    consumer_id: q.consumer_id,
    consumer_version: q.consumer_version,
    policy_snapshot: q.policy_snapshot,
    policy_sha256: q.policy_sha256,
    cancellation_disposition: "NONE",
  } as unknown as Task;
  return { a, task };
}
beforeEach(() => {
  f.queries = [];
  f.receipt = structuredClone(sqlReceipt);
  f.error = false;
});
it("full actual SQL Call/admission/completion projects strictly through the concrete connector and verifies", async () => {
  const { a, task } = identities();
  const checks = createUniversalTaskReceiptChecks(createModelTaskPgConnection(config));
  const result = {
    providerOutcome: "SETTLED",
    providerReceipt: {
      responseSha256: sqlReceipt.completion.response_sha256,
      costNanos: String(sqlReceipt.completion.cost_nanos),
    },
  } as UniversalResult;
  await expect(checks.assertCompletion(result, a, task)).resolves.toBeUndefined();
  expect(f.queries).toContain("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
  expect(f.queries.at(-1)).toBe("COMMIT");
});
it("scope price read traverses the real connector and commits a locking read transaction", async () => {
  const { a, task } = identities(),
    c = sqlReceipt.call,
    q = sqlReceipt.admission;
  f.scope = {
    actor_id: c.account_id,
    trip_id: c.trip_id,
    batch_id: c.import_id,
    task_id: c.task_id,
    attempt_id: c.attempt_id,
    call_id: c.call_id,
    integration_id: c.integration_id,
    provider_config_id: c.provider_config_id,
    price_schedule_id: c.price_schedule_id,
    request_sha256: c.request_sha256,
    provider_request_sha256: "f".repeat(64),
    input_sha256: c.input_sha256,
    model_binding: {
      version: 1,
      request: q.request_snapshot,
      request_sha256: q.request_sha256,
      profile: q.profile_snapshot,
      profile_sha256: q.profile_sha256,
    },
    input_ceiling: 32768,
    output_ceiling: 4096,
    max_cost_nanos: "1000000000",
    starts_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
    priceUnits: ["input_tokens", "cached_input_tokens", "output_tokens"].map((unit) => ({
      unit,
      quantity: 1,
      price: "0.00000014",
      definition: { relationship: "DISJOINT", billable: true },
    })),
  };
  const host = createUniversalPersistenceHost({
    connection: createModelTaskPgConnection(config),
    gateway: { invoke: vi.fn() } as never,
    stores: {} as never,
    attempt: a,
    requestMaterialByteCount: sqlReceipt.admission.request_snapshot.input.byte_count,
    currentTask: async () => task,
    environment: () => "enabled",
  });
  await expect(host.priceSchedule()).resolves.toMatchObject({ currency: "USD" });
  expect(f.queries).toContain("BEGIN ISOLATION LEVEL READ COMMITTED");
  expect(f.queries.at(-1)).toBe("COMMIT");
  f.error = true;
  await expect(host.priceSchedule()).rejects.toThrow("CP14_ADMISSION_CLOSED");
  expect(f.queries.at(-1)).toBe("ROLLBACK");
});
it("writing gateway commands use the same verified connector with a writable transaction", async () => {
  await universalPgTransaction(createModelTaskPgConnection(config), async (lease) =>
    lease.query("SELECT public.external_integration_usage_append($1::jsonb,$2::jsonb)", [
      "{}",
      "{}",
    ]),
  );
  expect(f.queries).toContain("BEGIN ISOLATION LEVEL READ COMMITTED");
  expect(f.queries).not.toContain("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
  expect(f.queries.at(-1)).toBe("COMMIT");
});
