import { beforeEach, expect, it, vi } from "vitest";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import {
  createCorePgConnection,
  createSourcePgConnection,
  createSourcePdfPgConnection,
  createTripPgConnection,
  createPersonPgConnection,
  createTripMetadataPgConnection,
  createModelTaskPgConnection,
} from "./tripCoreV2PgConnection";
const f = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  principal: "otr_trip_core_v2_gateway",
  roleOverride: null as string | null,
  recovery: false,
  constructorFailure: false,
  destroy: vi.fn(),
  end: vi.fn(),
  queries: [] as string[],
  created: 0,
  releases: [] as boolean[],
  loginEnabled: true,
  loginUnexpired: true,
  resetFailure: false,
  connectHold: undefined as Promise<void> | undefined,
}));
vi.mock("pg", () => {
  class Client {
    connection = { stream: { destroy: f.destroy } };
    constructor(config: Record<string, unknown>) {
      if (f.constructorFailure) throw Error("client initialization failed");
      f.config = config;
      f.created++;
    }
    on() {}
    removeListener() {}
    async connect() {}
    async end() {
      f.end();
    }
    async query(sql: string) {
      f.queries.push(sql);
      if (sql === "DISCARD ALL" && f.resetFailure) {
        f.resetFailure = false;
        throw Error("synthetic reset failure");
      }
      return {
        rows: sql.includes("pg_is_in_recovery")
          ? [
              {
                principal: f.principal,
                role: f.roleOverride ?? f.principal,
                recovery: f.recovery,
                login: f.loginEnabled,
                unexpired: f.loginUnexpired,
              },
            ]
          : [],
      };
    }
  }
  class Pool {
    private client?: Client & { release(destroy?: boolean): void };
    constructor(private config: Record<string, unknown>) {}
    on() {}
    async connect() {
      if (f.connectHold) await f.connectHold;
      if (!this.client) {
        const client = new Client(this.config) as Client & {
          release(destroy?: boolean): void;
        };
        client.release = (destroy = false) => {
          f.releases.push(destroy);
          if (destroy) {
            f.destroy();
            f.end();
            this.client = undefined;
          }
        };
        this.client = client;
      }
      return this.client;
    }
  }
  return { Client, Pool };
});
const config = {
  host: "db.synthetic.invalid",
  port: 5432,
  database: "postgres",
  password: "synthetic",
};
beforeEach(() => {
  f.principal = "otr_trip_core_v2_gateway";
  f.roleOverride = null;
  f.recovery = false;
  f.constructorFailure = false;
  f.destroy.mockClear();
  f.end.mockClear();
  f.queries = [];
  f.created = 0;
  f.releases = [];
  f.loginEnabled = true;
  f.loginUnexpired = true;
  f.resetFailure = false;
  f.connectHold = undefined;
});
it("requires a dedicated TLS primary and resets a finished Core session before reuse", async () => {
  const c = createCorePgConnection(config);
  await c.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.config.user).toBe("otr_trip_core_v2_gateway");
  expect(f.config.ssl).toMatchObject({ rejectUnauthorized: true });
  expect(f.destroy).not.toHaveBeenCalled();
  expect(f.queries.at(-1)).toBe("DISCARD ALL");
  expect(f.releases).toEqual([false]);
});
it("rejects transaction-pooler addresses, foreign principals, replicas and unfinished transactions", async () => {
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

it("serves concurrent Core requests FIFO through independently reset leases", async () => {
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
  expect(f.created).toBe(1);
  expect(f.releases).toEqual([false, false, false]);
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
  expect(f.end).toHaveBeenCalledTimes(1);
  expect(f.created).toBe(2);
  expect(f.releases).toEqual([true, false]);
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

it("reuses only a successfully reset Core client and checks identity on every checkout", async () => {
  const connection = createCorePgConnection(config);
  for (let i = 0; i < 2; i++)
    await connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query("COMMIT");
    });
  expect(f.created).toBe(1);
  expect(f.releases).toEqual([false, false]);
  expect(f.config).toMatchObject({
    max: 1,
    idleTimeoutMillis: 60000,
    maxLifetimeSeconds: 120,
  });
  expect(f.queries.filter((q) => q.includes("pg_is_in_recovery"))).toHaveLength(2);
  expect(f.queries.filter((q) => q === "DISCARD ALL")).toHaveLength(2);
});

it("rejects NOLOGIN before invoking the next Core callback on a warm connection", async () => {
  const connection = createCorePgConnection(config);
  await connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  f.loginEnabled = false;
  const work = vi.fn();
  await expect(connection.withLease(work)).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(work).not.toHaveBeenCalled();
  expect(f.releases).toEqual([false, true]);
});

it("destroys a reset failure without losing an already committed result", async () => {
  const connection = createCorePgConnection(config);
  f.resetFailure = true;
  await expect(
    connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query("COMMIT");
      return "committed";
    }),
  ).resolves.toBe("committed");
  expect(f.releases).toEqual([true]);
  await connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  expect(f.created).toBe(2);
});

it("does not let a released lease retire or query a later borrow of the same client", async () => {
  const connection = createCorePgConnection(config);
  let previous!: CorePgLease;
  await connection.withLease(async (lease) => {
    previous = lease;
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  await connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    previous.retire();
    await expect(previous.query("SELECT 'late'")).rejects.toThrow(
      "CORE_CONNECTION_RETIRED",
    );
    await lease.query("SELECT 1");
    await lease.query("COMMIT");
  });
  expect(f.created).toBe(1);
  expect(f.releases).toEqual([false, false]);
  expect(f.queries).not.toContain("SELECT 'late'");
});

it("destroys a checkout that completes after its original lease deadline", async () => {
  vi.useFakeTimers();
  let unblock!: () => void;
  try {
    f.connectHold = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const connection = createCorePgConnection(config),
      work = vi.fn();
    const outcome = connection.withLease(work).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await outcome).toBe("CORE_CONNECTION_TIMEOUT");
    unblock();
    await vi.advanceTimersByTimeAsync(0);
    expect(work).not.toHaveBeenCalled();
    expect(f.releases).toEqual([true]);
    f.connectHold = undefined;
    await connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      await lease.query("COMMIT");
    });
    expect(f.created).toBe(2);
  } finally {
    unblock?.();
    vi.useRealTimers();
  }
});

it("destroys an unexpected role before the owning Core callback", async () => {
  f.roleOverride = "otr_trip_core_v2_writer";
  const work = vi.fn();
  await expect(createCorePgConnection(config).withLease(work)).rejects.toThrow(
    "CORE_PRINCIPAL_UNAVAILABLE",
  );
  expect(work).not.toHaveBeenCalled();
  expect(f.releases).toEqual([true]);
});

it.each([
  ["otr_trip_source_command_gateway", createSourcePgConnection],
  ["otr_trip_source_command_gateway", createSourcePdfPgConnection],
  ["otr_trip_create_gateway", createTripPgConnection],
  ["otr_trip_metadata_gateway", createTripMetadataPgConnection],
  ["otr_trip_person_command_gateway", createPersonPgConnection],
  ["otr_external_integration_call_gateway", createModelTaskPgConnection],
] as const)(
  "keeps %s on fresh physical clients without Core Pool or reset",
  async (principal, make) => {
    f.principal = principal;
    const connection = make(config);
    for (let i = 0; i < 2; i++)
      await connection.withLease(async (lease) => {
        await lease.query("BEGIN");
        await lease.query("COMMIT");
      });
    expect(f.created).toBe(2);
    expect(f.end).toHaveBeenCalledTimes(2);
    expect(f.config).not.toHaveProperty("max");
    expect(f.releases).toEqual([]);
    expect(f.queries).not.toContain("DISCARD ALL");
  },
);

it("rejects an expired LOGIN before the next Core callback on a warm connection", async () => {
  const connection = createCorePgConnection(config);
  await connection.withLease(async (lease) => {
    await lease.query("BEGIN");
    await lease.query("COMMIT");
  });
  f.loginUnexpired = false;
  const work = vi.fn();
  await expect(connection.withLease(work)).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(work).not.toHaveBeenCalled();
  expect(f.releases).toEqual([false, true]);
});
