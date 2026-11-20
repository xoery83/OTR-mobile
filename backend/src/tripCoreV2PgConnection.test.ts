import { randomUUID } from "node:crypto";
import { createTripParentReceiptPgReader, createTripPgStorage } from "./tripCreatePgStorage";
import { tripMetadataV2Boundary } from "./tripMetadataV2";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";
import { runSourcePdfTimings } from "./sourcePdfTiming";
import { beforeEach, expect, it, vi } from "vitest";
import {
  createCorePgConnection,
  createSourcePgConnection,
  createSourcePdfPgConnection,
  createTripPgConnection,
  createTripMetadataPgConnection,
  createPersonPgConnection,
} from "./tripCoreV2PgConnection";
const f = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  principal: "otr_trip_core_v2_gateway",
  recovery: false,
  constructorFailure: false,
  discardFailure: false,
  parentResult: null as unknown,
  metadataResult: null as unknown,
  metadataReceipt: null as unknown,
  parentSqlState: null as string | null,
  parentByActor: new Map<string, unknown>(),
  parentScopeAllowed: true,
  queryCalls: [] as { sql: string; parameters: readonly unknown[] }[],
  connect: vi.fn(),
  destroy: vi.fn(),
  end: vi.fn<() => void | Promise<void>>(),
  queries: [] as string[],
}));
vi.mock("pg", () => ({
  Client: class {
    connection = { stream: { destroy: f.destroy } };
    constructor(config: Record<string, unknown>) {
      if (f.constructorFailure) throw Error("client initialization failed");
      f.config = config;
    }
    on() {}
    async connect() {
      f.connect();
    }
    async end() {
      await f.end();
    }
    async query(sql: string, parameters: readonly unknown[] = []) {
      f.queries.push(sql);
      f.queryCalls.push({ sql, parameters });
      if (f.discardFailure && sql === "DISCARD ALL") throw Error("reset failed");
      if (sql.includes("trip_create_parent_result")) {
        if (f.parentSqlState) throw Object.assign(Error("PRIVATE_SQL_PARAMS"), { code: f.parentSqlState });
        return { rows: [{ result: f.parentByActor.get(String(parameters[0])) ?? f.parentResult }] };
      }
      if (sql.includes("trip_create_finite_scope_allowed")) return { rows: [{ allowed: f.parentScopeAllowed }] };
      if (sql.includes("trip_create_result(")) return { rows: [{ result: f.parentByActor.get(String(parameters[1])) ?? f.parentResult }] };
      if (sql.includes("trip_metadata_finite_scope_allowed")) return { rows: [{ allowed: true }] };
      if (sql.includes("trip_metadata_update_command")) return { rows: [{ result: f.metadataReceipt }] };
      if (sql.includes("trip_metadata_snapshot")) return { rows: [{ result: f.metadataResult }] };
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
  f.constructorFailure = false;
  f.discardFailure = false;
  f.parentResult = null;
  f.metadataResult = null;
  f.metadataReceipt = null;
  f.parentSqlState = null;
  f.parentByActor.clear();
  f.parentScopeAllowed = true;
  f.queryCalls = [];
  f.connect.mockClear();
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

it("Source uses its own fixed principal through the same verified TLS driver", async () => {
  f.principal = "otr_trip_source_command_gateway";
  await createSourcePgConnection(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_source_command_gateway");
  expect(f.config.ssl).toMatchObject({ rejectUnauthorized: true });
});

it("Trip create uses only its own fixed principal on a verified primary", async () => {
  f.principal = "otr_trip_create_gateway";
  await createTripPgConnection(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_create_gateway");
  expect(f.config.ssl).toMatchObject({ rejectUnauthorized: true });
  f.principal = "otr_trip_core_v2_gateway";
  await expect(
    createTripPgConnection(config).withLease(async () => undefined),
  ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
});

it("Person uses only its reserved principal through the verified TLS primary driver", async () => {
  f.principal = "otr_trip_person_command_gateway";
  await createPersonPgConnection(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_person_command_gateway");
  expect(f.config.ssl).toMatchObject({ rejectUnauthorized: true });
  f.principal = "service_role";
  await expect(
    createPersonPgConnection(config).withLease(async () => undefined),
  ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
});

it("serves concurrent Core requests FIFO through fresh isolated sessions", async () => {
  const connection = createCorePgConnection(config),
    order: string[] = [];
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    order.push("first");
    started();
    await held;
    await lease.query("COMMIT");
    order.push("first committed");
  });
  await ready;
  const next = (name: string) =>
    connection.withLease(async (lease) => {
      order.push(name);
      await lease.query("BEGIN");
      await lease.query("COMMIT");
    });
  const finished = expect(
    Promise.all([first, next("second"), next("third")]),
  ).resolves.toEqual([undefined, undefined, undefined]);
  await Promise.resolve();
  expect(order).toEqual(["first"]);
  release();
  await finished;
  expect(order).toEqual(["first", "first committed", "second", "third"]);
  expect(f.end).toHaveBeenCalledTimes(3);
  expect(f.queries.filter((query) => query.includes("pg_is_in_recovery"))).toHaveLength(
    3,
  );
});

it("returns the slot if fresh client construction fails", async () => {
  const connection = createCorePgConnection(config);
  f.constructorFailure = true;
  await expect(connection.withLease(vi.fn())).rejects.toThrow(
    "client initialization failed",
  );
  f.constructorFailure = false;
  await connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
});

it("releases a failed Core holder before running the next fresh transaction", async () => {
  const connection = createCorePgConnection(config);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    started();
    await held;
    throw Error("holder failed");
  });
  const failed = expect(first).rejects.toThrow("holder failed");
  await ready;
  const second = expect(
    connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query("COMMIT");
    }),
  ).resolves.toBeUndefined();
  release();
  await failed;
  await second;
  expect(f.end).toHaveBeenCalledTimes(2);
});

it("bounds Core waiters and never runs an expired queued callback", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  try {
    const connection = createCorePgConnection(config),
      work = vi.fn();
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      started();
      await held;
      await lease.query("COMMIT");
    });
    await ready;
    const waiting = Promise.allSettled(
      Array.from({ length: 4 }, () => connection.withLease(work)),
    );
    let expired = false;
    void waiting.then(() => {
      expired = true;
    });
    await expect(connection.withLease(work)).rejects.toThrow("CORE_CONNECTION_BUSY");
    await vi.advanceTimersByTimeAsync(14_999);
    expect(expired).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const outcomes = await waiting;
    expect(
      outcomes.every(
        (outcome) =>
          outcome.status === "rejected" &&
          outcome.reason.message === "CORE_CONNECTION_BUSY",
      ),
    ).toBe(true);
    expect(work).not.toHaveBeenCalled();
    release();
    await first;
    await connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query("COMMIT");
    });
  } finally {
    release?.();
    vi.useRealTimers();
  }
});

it("keeps other owning principals fail-fast while occupied", async () => {
  f.principal = "otr_trip_person_command_gateway";
  const connection = createPersonPgConnection(config);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const first = connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    started();
    await held;
    await lease.query("COMMIT");
  });
  await ready;
  await expect(connection.withLease(vi.fn())).rejects.toThrow("CORE_CONNECTION_BUSY");
  release();
  await first;
});

it("PDF decoding gets a bounded Source-only lease while normal Source timeouts remain unchanged", async () => {
  const pdf = createSourcePdfPgConnection;
  f.principal = "otr_trip_source_command_gateway";
  await pdf(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_source_command_gateway");
  expect(f.config.connectionTimeoutMillis).toBe(5000);
  expect(f.config.query_timeout).toBe(5000);
  expect(f.config.options).toBe(
    "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=65000",
  );
  await createSourcePgConnection(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.connectionTimeoutMillis).toBe(3000);
  expect(f.config.options).toBe(
    "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
  );
});

it("PDF total lease retires at 75s and cannot send late statements", async () => {
  vi.useFakeTimers();
  try {
    f.principal = "otr_trip_source_command_gateway";
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcome = createSourcePdfPgConnection(config)
      .withLease(async (lease) => {
        await lease.query("BEGIN");
        await blocked;
        await lease.query("COMMIT");
      })
      .then(
        () => "unexpected",
        (error: Error) => error.message,
      );
    await vi.advanceTimersByTimeAsync(31000);
    expect(f.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(44000);
    expect(await outcome).toBe("CORE_CONNECTION_TIMEOUT");
    expect(f.destroy).toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.queries).not.toContain("COMMIT");
  } finally {
    vi.useRealTimers();
  }
});

it("lets a progressing owning Core transaction finish beyond 30s without relaxing query or idle limits", async () => {
  vi.useFakeTimers();
  try {
    const outcome = createCorePgConnection(config)
      .withLease(async (lease) => {
        await lease.query("BEGIN");
        for (let i = 0; i < 9; i++) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await lease.query("SELECT 1");
        }
        await lease.query("COMMIT");
      })
      .then(
        () => "committed",
        (error: Error) => error.message,
      );
    await vi.advanceTimersByTimeAsync(36000);
    expect(await outcome).toBe("committed");
    expect(f.config.query_timeout).toBe(5000);
    expect(f.config.options).toBe(
      "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
    );
  } finally {
    vi.useRealTimers();
  }
});

it("retires Core at its 60s hard deadline and rejects any late COMMIT", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  try {
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcome = createCorePgConnection(config)
      .withLease(async (lease) => {
        await lease.query("BEGIN");
        await blocked;
        await lease.query("COMMIT");
      })
      .then(
        () => "unexpected",
        (error: Error) => error.message,
      );
    await vi.advanceTimersByTimeAsync(59999);
    expect(f.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("CORE_CONNECTION_TIMEOUT");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.queries).not.toContain("COMMIT");
  } finally {
    release?.();
    vi.useRealTimers();
  }
});

it.each(["PDF", "ordinary Source"])("reuses one clean %s socket, then destroys it if session reset fails", async (kind) => {
  f.principal = "otr_trip_source_command_gateway";
  const connection = kind === "PDF" ? createSourcePdfPgConnection(config) : createSourcePgConnection(config, true);
  const work = async (
    lease: Parameters<Parameters<typeof connection.withLease>[0]>[0],
  ) => {
    expect(lease.verifiedSourceSession).toBe(true);
    await lease.query("BEGIN");
    await lease.query("SET LOCAL ROLE otr_trip_source_writer");
    await lease.query("COMMIT");
  };
  try {
    await connection.withLease(work);
    await connection.withLease(work);
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.queries.filter((sql) => sql === "DISCARD ALL")).toHaveLength(1);
    expect(f.queries.indexOf("DISCARD ALL")).toBeLessThan(f.queries.lastIndexOf("BEGIN"));
    expect(f.destroy).not.toHaveBeenCalled();
    f.discardFailure = true;
    const blocked = vi.fn(work);
    await expect(connection.withLease(blocked)).rejects.toThrow("reset failed");
    expect(blocked).not.toHaveBeenCalled();
    expect(f.destroy).toHaveBeenCalledOnce();
    await connection.withLease(work);
    expect(f.connect).toHaveBeenCalledTimes(2);
  } finally {
    await connection.close();
  }
  expect(f.destroy).toHaveBeenCalledTimes(2);
});

it.each([
  { firstPath: "PDF", nextPath: "PDF" },
  { firstPath: "PDF", nextPath: "ordinary Source" },
  { firstPath: "ordinary Source", nextPath: "PDF" },
])("waits for $firstPath retirement before opening $nextPath", async ({ firstPath, nextPath }) => {
  vi.useFakeTimers();
  f.principal = "otr_trip_source_command_gateway";
  const pdf = createSourcePdfPgConnection(config);
  const source = createSourcePgConnection(config, true);
  const first = firstPath === "PDF" ? pdf : source;
  const nextConnection = nextPath === "PDF" ? pdf : source;
  const work = async (
    lease: Parameters<Parameters<typeof pdf.withLease>[0]>[0],
  ) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  };
  let finishClose!: () => void;
  try {
    await first.withLease(work);
    f.end.mockImplementationOnce(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.end).toHaveBeenCalledOnce();
    const next = (async () => {
      if (first !== nextConnection) await first.discardIdle();
      await nextConnection.withLease(work);
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.connect).toHaveBeenCalledOnce();
    finishClose();
    await next;
    expect(f.connect).toHaveBeenCalledTimes(2);
  } finally {
    finishClose?.();
    await source.close();
    await pdf.close();
    vi.useRealTimers();
  }
});


it("retains actual adapter connect failure stage without changing the original error", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const original = Object.assign(Error("PRIVATE_PASSWORD_CONNECTION"), { code: "53300" });
  f.connect.mockImplementationOnce(() => { throw original; });
  const connection = createCorePgConnection(config);
  try {
    await expect(runSourcePdfTimings("core-request", "core-read", () =>
      connection.withLease(async (lease) => { await lease.query("COMMIT"); }),
    )).rejects.toBe(original);
    expect(f.queries).toEqual([]);
    expect(f.end).toHaveBeenCalledOnce();
    const result = JSON.parse(String(log.mock.calls[0][0]));
    expect(result).toMatchObject({ requestId: "core-request", phases: {
      pg_connect: { count: 1, errorCodes: { "53300": 1 } },
    } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_");
    await connection.withLease(async (lease) => { await lease.query("COMMIT"); });
  } finally { log.mockRestore(); }
});


it("preserves fail-fast behavior for legacy unwrapped Parent leases", async () => {
  f.principal = "otr_trip_create_gateway";
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const connection = createTripPgConnection(config);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const first = connection.withLease(async (lease) => {
    await lease.query("BEGIN"); started(); await held; await lease.query("COMMIT");
  });
  await ready;
  try {
    const read = createTripParentReceiptPgReader(connection);
    await expect(runSourcePdfTimings("parent-busy", "parent-receipt-read", () => read(randomUUID(), randomUUID())))
      .rejects.toMatchObject({ status: 503, code: "TRIP_CREATE_UNAVAILABLE" });
    expect(f.connect).toHaveBeenCalledOnce();
    const row = JSON.parse(String(log.mock.calls[0][0]));
    expect(row.phases).toEqual({ pg_lease_wait: expect.objectContaining({ errorCodes: { CORE_CONNECTION_BUSY: 1 } }) });
    expect(f.queries).toHaveLength(2);
  } finally { release(); await first; log.mockRestore(); }
});

it.each(["connect", "query", "schema"] as const)("retains the original Parent READ %s failure phase before classification", async (stage) => {
  f.principal = "otr_trip_create_gateway";
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const actor = randomUUID(), trip = randomUUID();
  if (stage === "connect") f.connect.mockImplementationOnce(() => { throw Object.assign(Error("PRIVATE_PASSWORD"), { code: "53300" }); });
  if (stage === "query") f.parentSqlState = "57014";
  if (stage === "schema") f.parentResult = { PRIVATE_BODY: "PRIVATE_VALUES" };
  try {
    const read = createTripParentReceiptPgReader(createTripPgConnection(config));
    await expect(runSourcePdfTimings("parent-" + stage, "parent-receipt-read", () => read(actor, trip)))
      .rejects.toMatchObject({ status: 503, code: "TRIP_CREATE_UNAVAILABLE" });
    const row = JSON.parse(String(log.mock.calls[0][0]));
    if (stage === "connect") {
      expect(row.phases.pg_connect.errorCodes).toEqual({ "53300": 1 });
      expect(row.phases.pg_read_result).toBeUndefined();
      expect(f.queries).toEqual([]);
    } else if (stage === "query") {
      expect(row.phases.pg_source_command.errorCodes).toEqual({ "57014": 1 });
      expect(row.phases.pg_read_result.errorCodes).toEqual({ "57014": 1 });
      expect(f.queries.at(-1)).toBe("ROLLBACK");
    } else {
      expect(row.phases.pg_source_command.failures).toEqual({});
      expect(row.phases.pg_read_result.errorCodes).toEqual({ RESULT_SCHEMA_INVALID: 1 });
      expect(f.queries.at(-1)).toBe("ROLLBACK");
    }
    for (const secret of [actor, trip, "PRIVATE_"]) expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  } finally { log.mockRestore(); }
});

it("preserves the owning Parent READ result and fresh-session retirement", async () => {
  f.principal = "otr_trip_create_gateway";
  const actor = randomUUID(), trip = randomUUID();
  f.parentResult = { operationId: randomUUID(), tripId: trip, actorAccountId: actor,
    name: "PRIVATE_TRIP_NAME", destination: null, startDate: null, endDate: null,
    ownerPersonId: randomUUID(), coreEpoch: randomUUID(), coreRevision: 1, coreAccessRevision: 1,
    formatVersion: 2, destinations: [], metadataRevision: 0 };
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const read = createTripParentReceiptPgReader(createTripPgConnection(config));
    const result = await runSourcePdfTimings("parent-ok", "parent-receipt-read", () => read(actor, trip));
    expect(result).toEqual(f.parentResult);
    expect(f.end).toHaveBeenCalledOnce();
    expect(f.queries.at(-1)).toBe("COMMIT");
    const row = JSON.parse(String(log.mock.calls[0][0]));
    expect(row.phases.pg_read_result.failures).toEqual({});
    expect(row.phases.pg_read_result.errorCodes).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_");
  } finally { log.mockRestore(); }
});


function parentValue(actor: string, trip: string) {
  return { operationId: randomUUID(), tripId: trip, actorAccountId: actor,
    name: "PRIVATE_PARENT", destination: null, startDate: null, endDate: null,
    ownerPersonId: randomUUID(), coreEpoch: randomUUID(), coreRevision: 1, coreAccessRevision: 1,
    formatVersion: 2, destinations: [], metadataRevision: 0 };
}

it("serializes concurrent Parent and Receipt reads on the same single factory", async () => {
  f.principal = "otr_trip_create_gateway";
  const actor = randomUUID(), trip = randomUUID();
  f.parentResult = parentValue(actor, trip);
  const connection = createTripPgConnection(config);
  const reads = { withLease: connection.withReadLease.bind(connection) };
  const parent = createTripParentReceiptPgReader(reads), receipts = createTripPgStorage(reads);
  let live = 0, maximum = 0;
  f.connect.mockImplementation(() => { maximum = Math.max(maximum, ++live); });
  f.end.mockImplementation(() => { live--; });
  try {
    const result = await Promise.all([parent(actor, trip), parent(actor, trip), receipts.receipt(actor, (f.parentResult as { operationId: string }).operationId)]);
    expect(result).toEqual([f.parentResult, f.parentResult, f.parentResult]);
    expect(maximum).toBe(1);expect(live).toBe(0);
    expect(f.connect).toHaveBeenCalledTimes(3);expect(f.end).toHaveBeenCalledTimes(3);
  } finally { f.connect.mockReset(); f.end.mockReset(); }
});

it("returns two Metadata v3 HTTP reads queued behind the active owning lease", async () => {
  f.principal = "otr_trip_metadata_gateway";
  const connection = createTripMetadataPgConnection(config);
  const port = createTripMetadataV2PgStorage(connection);
  const actor = randomUUID(), tripId = randomUUID();
  f.metadataResult = {
    formatVersion: 3, actorAccountId: actor, tripId, metadataRevision: 1,
    metadata: { name: "Synthetic", destination: null, destinations: [], startDate: null, endDate: null },
  };
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const active = connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    started();
    await held;
    await lease.query("COMMIT");
  });
  await ready;
  const read = () => tripMetadataV2Boundary(new Request(`http://unit/v2/trips/${tripId}/metadata`, {
    headers: { "OTR-Trip-Metadata-Version": "3", "OTR-Metadata-Operation-Id": randomUUID() },
  }), actor, port);
  const waiting = Promise.all([read(), read()]);
  try {
    expect(f.connect).toHaveBeenCalledOnce();
  } finally {
    release();
    await active;
  }
  for (const response of await waiting) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(f.metadataResult);
  }
  expect(f.connect).toHaveBeenCalledTimes(3);
  expect(f.end).toHaveBeenCalledTimes(3);
});

it.each([true, false, "timeout"] as const)("rechecks Managed metadata write admission after a concurrent read (%s)", async (allowed) => {
  f.principal = "otr_trip_metadata_gateway";
  const connection = createTripMetadataPgConnection(config);
  const storage = createTripMetadataV2PgStorage(connection);
  const actor = randomUUID(), tripId = randomUUID(), operationId = randomUUID();
  const before = { name: "Synthetic", destination: null, startDate: null, endDate: null, destinations: [] };
  const input = { formatVersion: 3 as const, tripId, operationId, expectedMetadataRevision: 2,
    before, after: { ...before, endDate: "2026-12-17" } };
  f.metadataResult = { formatVersion: 3, actorAccountId: actor, tripId, metadataRevision: 2, metadata: before };
  f.metadataReceipt = { ...input, actorAccountId: actor, resultMetadataRevision: 3 };
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const polling = connection.withReadLease(async (lease) => {
    await lease.query("BEGIN");
    started();
    await held;
    await lease.query("COMMIT");
  });
  await ready;
  if (allowed === "timeout") vi.useFakeTimers();
  const admit = vi.fn(async () => allowed === true);
  const update = storage.update(actor, input, admit);
  try {
    if (allowed === "timeout") {
      const rejected = expect(update).rejects.toMatchObject({ code: "TRIP_METADATA_LEASE_BUSY" });
      await vi.advanceTimersByTimeAsync(15_001);
      await rejected;
    }
    expect(f.connect).toHaveBeenCalledOnce();
    expect(admit).not.toHaveBeenCalled();
  } finally {
    release();
    await polling;
    if (allowed === "timeout") vi.useRealTimers();
  }
  if (allowed === "timeout") {
    expect(admit).not.toHaveBeenCalled();
    expect(f.queries.some((sql) => sql.includes("trip_metadata_update_command"))).toBe(false);
    return;
  }
  if (allowed) await expect(update).resolves.toEqual(f.metadataReceipt);
  else await expect(update).rejects.toMatchObject({ code: "MCP_WRITE_ADMISSION_DENIED" });
  expect(admit).toHaveBeenCalledExactlyOnceWith(actor, input);
  expect(f.queries.filter((sql) => sql.includes("trip_metadata_update_command"))).toHaveLength(allowed ? 1 : 0);
});

it("lets reads wait for an active write lease but never queues a new Create write", async () => {
  f.principal = "otr_trip_create_gateway";
  const actor = randomUUID(), trip = randomUUID();f.parentResult = parentValue(actor, trip);
  const connection = createTripPgConnection(config);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const activeWrite = connection.withLease(async lease => { await lease.query("BEGIN");started();await held;await lease.query("COMMIT"); });
  await ready;
  const parent = createTripParentReceiptPgReader({ withLease: connection.withReadLease.bind(connection) });
  const pendingRead = parent(actor, trip);
  const input = { operationId: randomUUID(), tripId: trip, name: "No late write", destination: null, startDate: null, endDate: null };
  try {
    await expect(createTripPgStorage(connection).create(actor, input)).rejects.toMatchObject({ code: "TRIP_CREATE_UNAVAILABLE" });
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.queries.some(sql => sql.includes("trip_create_command"))).toBe(false);
  } finally { release();await activeWrite; }
  expect(await pendingRead).toEqual(f.parentResult);
  expect(f.queries.some(sql => sql.includes("trip_create_command"))).toBe(false);
  expect(f.connect).toHaveBeenCalledTimes(2);
});

it.each([
  ["otr_trip_create_gateway", createTripPgConnection],
  ["otr_trip_metadata_gateway", createTripMetadataPgConnection],
] as const)("bounds %s read waiters and keeps busy writes out of the queue", async (principal, connect) => {
  vi.useFakeTimers();f.principal = principal;
  const connection = connect(config), work = vi.fn();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const active = connection.withLease(async lease => { await lease.query("BEGIN");started();await held;await lease.query("COMMIT"); });
  await ready;
  try {
    const pending = Promise.allSettled(Array.from({ length: 4 }, () => connection.withReadLease(work)));
    await expect(connection.withReadLease(work)).rejects.toThrow("CORE_CONNECTION_BUSY");
    await expect(connection.withLease(work)).rejects.toThrow("CORE_CONNECTION_BUSY");
    await vi.advanceTimersByTimeAsync(15001);
    expect((await pending).every(x => x.status === "rejected" && x.reason.message === "CORE_CONNECTION_BUSY")).toBe(true);
    expect(work).not.toHaveBeenCalled();
    release();await active;
    await connection.withReadLease(async lease => { await lease.query("BEGIN");await lease.query("COMMIT"); });
    expect(work).not.toHaveBeenCalled();
  } finally { release();await active;vi.useRealTimers(); }
});

it("releases failed Trip leases and rechecks queued Parent scope", async () => {
  f.principal = "otr_trip_create_gateway";
  const actor = randomUUID(), trip = randomUUID();f.parentResult = parentValue(actor, trip);
  const connection = createTripPgConnection(config);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const first = connection.withLease(async lease => { await lease.query("BEGIN");started();await held;throw Error("failed owner"); }).catch(e => e.message);
  await ready;
  const read = createTripParentReceiptPgReader({ withLease: connection.withReadLease.bind(connection) });
  const pending = read(actor, trip).catch(e => e.code);
  f.parentScopeAllowed = false;release();expect(await first).toBe("failed owner");
  expect(await pending).toBe("TRIP_CREATE_CLOSED");
  expect(f.queries.at(-1)).toBe("ROLLBACK");
  f.parentScopeAllowed = true;expect(await read(actor, trip)).toEqual(f.parentResult);
  expect(f.end).toHaveBeenCalledTimes(3);
});

it("keeps queued Parent actor and Trip results isolated across fresh identities", async () => {
  f.principal = "otr_trip_create_gateway";
  const actorA = randomUUID(), actorB = randomUUID(), tripA = randomUUID(), tripB = randomUUID();
  const valueA = parentValue(actorA, tripA), valueB = parentValue(actorB, tripB);
  f.parentByActor.set(actorA, valueA);f.parentByActor.set(actorB, valueB);
  const connection = createTripPgConnection(config), read = createTripParentReceiptPgReader({ withLease: connection.withReadLease.bind(connection) });
  expect(await Promise.all([read(actorA, tripA), read(actorB, tripB)])).toEqual([valueA, valueB]);
  expect(f.queryCalls.filter(x => x.sql.includes("trip_create_parent_result")).map(x => x.parameters)).toEqual([[actorA, tripA], [actorB, tripB]]);
  expect(f.queries.filter(sql => sql.includes("pg_is_in_recovery"))).toHaveLength(2);
  f.principal = "service_role";await expect(read(actorA, tripA)).rejects.toMatchObject({ code: "TRIP_CREATE_UNAVAILABLE" });
  f.principal = "otr_trip_create_gateway";expect(await read(actorB, tripB)).toEqual(valueB);
});


it("never connects or dispatches queued Trip reads after adapter close", async () => {
  f.principal = "otr_trip_create_gateway";
  const connection = createTripPgConnection(config), work = vi.fn();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const active = connection.withLease(async lease => {
    await lease.query("BEGIN");started();await held;await lease.query("COMMIT");
  });
  await ready;
  const pending = Promise.allSettled([connection.withReadLease(work), connection.withReadLease(work)]);
  await (connection as typeof connection & { close(): Promise<void> | undefined }).close();release();await active;
  expect((await pending).every(x => x.status === "rejected" && x.reason.message === "CORE_CONNECTION_RETIRED")).toBe(true);
  expect(work).not.toHaveBeenCalled();
  expect(f.connect).toHaveBeenCalledOnce();expect(f.end).toHaveBeenCalledOnce();
  await expect(connection.withReadLease(work)).rejects.toThrow("CORE_CONNECTION_RETIRED");
});
