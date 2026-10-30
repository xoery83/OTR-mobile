import { beforeEach, expect, it, vi } from "vitest";
import {
  createCorePgConnection,
  createSourcePgConnection,
  createSourcePdfPgConnection,
  createTripPgConnection,
  createPersonPgConnection,
} from "./tripCoreV2PgConnection";
const f = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  principal: "otr_trip_core_v2_gateway",
  recovery: false,
  constructorFailure: false,
  destroy: vi.fn(),
  end: vi.fn(),
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
  f.constructorFailure = false;
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
  expect(f.config.query_timeout).toBe(5000);
  expect(f.config.options).toBe(
    "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=65000",
  );
  await createSourcePgConnection(config).withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
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
